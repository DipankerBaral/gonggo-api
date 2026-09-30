const config = require('./config');
const app = require('./app');

if (config.seed) require('./seed')();

app.listen(config.port, () => {
  console.log(`GongGo API listening on port ${config.port}`);
});
