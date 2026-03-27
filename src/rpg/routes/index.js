'use strict';

const express = require('express');
const router = express.Router();

router.use('/character',    require('./character'));
router.use('/habits',       require('./habits'));
router.use('/tasks',        require('./tasks'));
router.use('/rewards',      require('./rewards'));
router.use('/unlockables',  require('./unlockables'));
router.use('/activity',     require('./activity'));
router.use('/maintenance',  require('./maintenance'));

module.exports = router;
