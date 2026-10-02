#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Removes GongGo app resources that exist in AWS but not in Terraform's state,
# for example after a `terraform apply` was interrupted halfway.
#
# Run `terraform destroy` in infra/ FIRST, so Terraform removes everything it
# knows about. This script then removes the leftovers it doesn't know about.
#
#   bash scripts/cleanup-orphans.sh          # dry run: only lists what it would delete
#   bash scripts/cleanup-orphans.sh --yes    # actually deletes
#
# It only touches the app's resources, by their exact GongGo names, and VPCs
# tagged Project=gonggo + ManagedBy=terraform. It never touches the bootstrap
# stack (state bucket, ECR images, OIDC provider, deploy role), Parameter Store
# secrets you created by hand (like /gonggo/google-client-secret), or anything else.
# ---------------------------------------------------------------------------
set -uo pipefail
export MSYS_NO_PATHCONV=1 # stop Git Bash rewriting /gonggo/... into Windows paths
export AWS_PAGER=""
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-southeast-2}"

MODE="${1:-}"
DELETE=false
[ "$MODE" = "--yes" ] && DELETE=true

if $DELETE; then echo "== Deleting leftovers in $AWS_DEFAULT_REGION =="; else echo "== Dry run: nothing will be deleted. Re-run with --yes to delete. =="; fi
FOUND=0

# Prints the command, and runs it only with --yes. Failures are reported, not fatal.
act() {
  FOUND=$((FOUND + 1))
  if $DELETE; then
    echo "+ $*"
    "$@" >/dev/null || echo "  ! that command failed (it may already be gone); carrying on"
  else
    echo "  would run: $*"
  fi
}

# Runs only with --yes (used for waiting)
wait_for() { if $DELETE; then echo "  waiting: $*"; "$@" || true; fi; }

# Treats AWS's empty answers ("" or "None") as nothing found
present() { [ -n "${1:-}" ] && [ "$1" != "None" ]; }

echo
echo "-- ECS (containers)"
CLUSTER=$(aws ecs describe-clusters --clusters gonggo --query 'clusters[?status==`ACTIVE`].clusterName' --output text 2>/dev/null)
if present "$CLUSTER"; then
  for svc in $(aws ecs list-services --cluster gonggo --query 'serviceArns[]' --output text); do
    act aws ecs delete-service --cluster gonggo --service "$svc" --force
    wait_for aws ecs wait services-inactive --cluster gonggo --services "$svc"
  done
  act aws ecs delete-cluster --cluster gonggo
fi

echo "-- Load balancer"
LB=$(aws elbv2 describe-load-balancers --names gonggo-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null)
if present "$LB"; then
  act aws elbv2 delete-load-balancer --load-balancer-arn "$LB"
  wait_for aws elbv2 wait load-balancers-deleted --load-balancer-arns "$LB"
fi
TG=$(aws elbv2 describe-target-groups --names gonggo-api --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null)
present "$TG" && act aws elbv2 delete-target-group --target-group-arn "$TG"

echo "-- Database (this one takes 5-10 minutes to delete)"
if aws rds describe-db-instances --db-instance-identifier gonggo-db >/dev/null 2>&1; then
  act aws rds delete-db-instance --db-instance-identifier gonggo-db --skip-final-snapshot --delete-automated-backups
  wait_for aws rds wait db-instance-deleted --db-instance-identifier gonggo-db
fi
if aws rds describe-db-subnet-groups --db-subnet-group-name gonggo-db >/dev/null 2>&1; then
  act aws rds delete-db-subnet-group --db-subnet-group-name gonggo-db
fi

echo "-- Sign-in (Cognito)"
for pool in $(aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='gonggo'].Id" --output text); do
  DOMAIN=$(aws cognito-idp describe-user-pool --user-pool-id "$pool" --query 'UserPool.Domain' --output text)
  present "$DOMAIN" && act aws cognito-idp delete-user-pool-domain --domain "$DOMAIN" --user-pool-id "$pool"
  act aws cognito-idp delete-user-pool --user-pool-id "$pool"
done

echo "-- Secrets the app's Terraform creates (not ones you added by hand)"
for name in /gonggo/admin-key /gonggo/database-url; do
  if aws ssm get-parameter --name "$name" >/dev/null 2>&1; then act aws ssm delete-parameter --name "$name"; fi
done

echo "-- Logs"
LOGS=$(aws logs describe-log-groups --log-group-name-prefix /ecs/gonggo-api --query 'logGroups[?logGroupName==`/ecs/gonggo-api`].logGroupName' --output text)
present "$LOGS" && act aws logs delete-log-group --log-group-name /ecs/gonggo-api

echo "-- IAM roles for the containers"
for role in gonggo-ecs-execution gonggo-ecs-task; do
  if aws iam get-role --role-name "$role" >/dev/null 2>&1; then
    for arn in $(aws iam list-attached-role-policies --role-name "$role" --query 'AttachedPolicies[].PolicyArn' --output text); do
      act aws iam detach-role-policy --role-name "$role" --policy-arn "$arn"
    done
    for pol in $(aws iam list-role-policies --role-name "$role" --query 'PolicyNames[]' --output text); do
      act aws iam delete-role-policy --role-name "$role" --policy-name "$pol"
    done
    act aws iam delete-role --role-name "$role"
  fi
done

echo "-- Networks (VPCs tagged Project=gonggo, ManagedBy=terraform)"
for vpc in $(aws ec2 describe-vpcs --filters Name=tag:Project,Values=gonggo Name=tag:ManagedBy,Values=terraform --query 'Vpcs[].VpcId' --output text); do
  echo "   VPC $vpc"
  ENIS=$(aws ec2 describe-network-interfaces --filters Name=vpc-id,Values="$vpc" --query 'NetworkInterfaces[].NetworkInterfaceId' --output text)
  if present "$ENIS" && $DELETE; then
    echo "  ! network interfaces still in use: $ENIS"
    echo "    (usually the database or load balancer still shutting down). Wait a few minutes and run this again."
    continue
  fi
  # Security groups refer to each other (db <- api <- alb), so delete in that order
  for name in gonggo-db gonggo-api gonggo-alb; do
    SG=$(aws ec2 describe-security-groups --filters Name=vpc-id,Values="$vpc" Name=group-name,Values="$name" --query 'SecurityGroups[0].GroupId' --output text)
    present "$SG" && act aws ec2 delete-security-group --group-id "$SG"
  done
  for subnet in $(aws ec2 describe-subnets --filters Name=vpc-id,Values="$vpc" --query 'Subnets[].SubnetId' --output text); do
    act aws ec2 delete-subnet --subnet-id "$subnet"
  done
  for rt in $(aws ec2 describe-route-tables --filters Name=vpc-id,Values="$vpc" --query 'RouteTables[?!(Associations[?Main])].RouteTableId' --output text); do
    for assoc in $(aws ec2 describe-route-tables --route-table-ids "$rt" --query 'RouteTables[0].Associations[].RouteTableAssociationId' --output text); do
      act aws ec2 disassociate-route-table --association-id "$assoc"
    done
    act aws ec2 delete-route-table --route-table-id "$rt"
  done
  for igw in $(aws ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values="$vpc" --query 'InternetGateways[].InternetGatewayId' --output text); do
    act aws ec2 detach-internet-gateway --internet-gateway-id "$igw" --vpc-id "$vpc"
    act aws ec2 delete-internet-gateway --internet-gateway-id "$igw"
  done
  act aws ec2 delete-vpc --vpc-id "$vpc"
done

echo
if [ "$FOUND" -eq 0 ]; then
  echo "Nothing left over. AWS is clean."
elif $DELETE; then
  echo "Done. Run this script again (without --yes) to check nothing is left."
else
  echo "Found $FOUND things to remove. Re-run with --yes to delete them."
fi
