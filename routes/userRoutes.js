const express = require('express');
const router = express.Router();
const requireLogin = require('../modules/authenticate');
const userController = require('../controllers/userController');

router.get('/users', requireLogin, userController.users);
router.post('/users', requireLogin, userController.createUser);
router.post('/users/:id', requireLogin, userController.updateUser);

module.exports = router;
