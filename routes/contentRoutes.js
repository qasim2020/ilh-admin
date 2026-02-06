const express = require('express');
const router = express.Router();
const requireLogin = require('../modules/authenticate');
const pageController = require('../controllers/pageController');

router.get('/pages/about', requireLogin, pageController.pagesAbout);
router.get('/pages/contact', requireLogin, pageController.pagesContact);
router.get('/pages/faq', requireLogin, pageController.pagesFaq);

router.get('/legal/terms', requireLogin, pageController.legalTerms);
router.get('/legal/privacy', requireLogin, pageController.legalPrivacy);
router.get('/legal/cookies', requireLogin, pageController.legalCookies);

module.exports = router;
