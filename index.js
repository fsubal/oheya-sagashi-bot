const express = require('express');
const main = require('./task/main');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

main();

app.listen(process.env.PORT || 5000);
console.log('running...');

process.on('unhandledRejection', console.error);
