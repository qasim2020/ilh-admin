const express = require('express');
const router = express.Router();
const requireLogin = require('../modules/authenticate');
const pageController = require('../controllers/pageController');

router.get('/pages', requireLogin, pageController.pagesIndex);
router.get('/pages/about', requireLogin, pageController.pagesAbout);
router.get('/pages/contact', requireLogin, pageController.pagesContact);
router.get('/pages/faq', requireLogin, pageController.pagesFaq);
router.post('/pages/:key', requireLogin, pageController.savePage);

router.get('/legal', requireLogin, pageController.legalPagesIndex);
router.get('/legal/terms', requireLogin, pageController.legalTerms);
router.get('/legal/privacy', requireLogin, pageController.legalPrivacy);
router.get('/legal/cookies', requireLogin, pageController.legalCookies);
router.post('/legal/:key', requireLogin, pageController.savePage);

module.exports = router;
