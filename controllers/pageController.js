const renderStaticPage = (req, res, page) => {
    res.render('static-page', {
        pagePretitle: page.pretitle,
        pageTitle: page.title,
        pageDescription: page.description,
        activeMenu: page.activeMenu,
        userId: req.session.userId,
        userName: req.session.name,
        sidebarCollapsed: req.session.sidebarCollapsed ? req.session.sidebarCollapsed : false,
    });
};

exports.pagesAbout = (req, res) => {
    renderStaticPage(req, res, {
        pretitle: 'Pages',
        title: 'About',
        description: 'Manage the About page content.',
        activeMenu: 'pages',
    });
};

exports.pagesContact = (req, res) => {
    renderStaticPage(req, res, {
        pretitle: 'Pages',
        title: 'Contact',
        description: 'Manage the Contact page content.',
        activeMenu: 'pages',
    });
};

exports.pagesFaq = (req, res) => {
    renderStaticPage(req, res, {
        pretitle: 'Pages',
        title: 'FAQ',
        description: 'Manage the FAQ page content.',
        activeMenu: 'pages',
    });
};

exports.legalTerms = (req, res) => {
    renderStaticPage(req, res, {
        pretitle: 'Legal Pages',
        title: 'Terms',
        description: 'Manage the Terms and Conditions content.',
        activeMenu: 'legal-pages',
    });
};

exports.legalPrivacy = (req, res) => {
    renderStaticPage(req, res, {
        pretitle: 'Legal Pages',
        title: 'Privacy',
        description: 'Manage the Privacy Policy content.',
        activeMenu: 'legal-pages',
    });
};

exports.legalCookies = (req, res) => {
    renderStaticPage(req, res, {
        pretitle: 'Legal Pages',
        title: 'Cookies',
        description: 'Manage the Cookies Policy content.',
        activeMenu: 'legal-pages',
    });
};

exports.blogsIndex = (req, res) => {
    renderStaticPage(req, res, {
        pretitle: 'Blogs',
        title: 'Blogs',
        description: 'Manage blog posts.',
        activeMenu: 'blogs',
    });
};
