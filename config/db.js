const mongoose = require("mongoose");
const User = require('../models/User');
const Page = require('../models/Page');
const Settings = require('../models/Settings');

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI);
  await createDefaultUser();
  await seedDefaultPages();
  await seedSettingsFromEnv();
}

function parseEnvBool(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return undefined;
}

async function seedSettingsFromEnv() {
  const envHost = process.env.HOST?.trim();
  const envPort = process.env.PORT;
  const envSecure = parseEnvBool(process.env.SSL);
  const envUser = process.env.USER?.trim();
  const envPass = process.env.PASS?.trim();
  const envFromName = process.env.FROM_NAME?.trim();

  const existing = await Settings.findOne({ key: 'main' }).lean();
  if (!existing) {
    await Settings.create({
      key: 'main',
      emailHost: envHost || '',
      emailPort: envPort ? Number(envPort) : 587,
      emailSecure: envSecure ?? false,
      emailUser: envUser || '',
      emailPass: envPass || '',
      emailFromName: envFromName || 'iLearningHubb',
    });
    return;
  }

  const updates = {};
  if (!existing.emailHost && envHost) updates.emailHost = envHost;
  if ((existing.emailPort === undefined || existing.emailPort === null) && envPort) {
    updates.emailPort = Number(envPort);
  }
  if ((existing.emailSecure === undefined || existing.emailSecure === null) && envSecure !== undefined) {
    updates.emailSecure = envSecure;
  }
  if (!existing.emailUser && envUser) updates.emailUser = envUser;
  if (!existing.emailPass && envPass) updates.emailPass = envPass;
  if (!existing.emailFromName && envFromName) updates.emailFromName = envFromName;

  if (Object.keys(updates).length > 0) {
    await Settings.updateOne({ key: 'main' }, { $set: updates });
  }
}

async function createDefaultUser() {
    const existing = await User.findOne();
    if (!existing) {
        await User.create({
            name: 'Qasim Ali',
            email: 'qasimali24@gmail.com'
        });
    }
}

async function seedDefaultPages() {
  const defaults = [
    {
      key: 'about',
      type: 'page',
      title: 'About',
      content: `
<h2>About iLearningHubb</h2>
<p>iLearningHubb is a learning community dedicated to nurturing confident, curious, and compassionate children. We deliver engaging programs that blend creativity, values, and hands-on discovery.</p>
<h3>Our Mission</h3>
<p>To inspire and empower young learners by providing meaningful educational experiences that build character, skills, and lifelong love of learning.</p>
<h3>What We Do</h3>
<ul>
  <li>Structured programs for different age groups</li>
  <li>Activities that promote teamwork and leadership</li>
  <li>Safe, supportive learning environments</li>
</ul>
<h3>Why Families Choose Us</h3>
<p>We combine high-quality instruction with a caring atmosphere that helps children thrive academically, socially, and emotionally.</p>
      `.trim(),
    },
    {
      key: 'contact',
      type: 'page',
      title: 'Contact',
      content: `
<h2>Contact iLearningHubb</h2>
<p>We’d love to hear from you. Reach out with questions about programs, enrollment, or partnerships.</p>
<h3>Get in Touch</h3>
<ul>
  <li><strong>Email:</strong> info@ilearninghubb.com</li>
  <li><strong>Phone:</strong> +1 (000) 000-0000</li>
  <li><strong>Hours:</strong> Mon–Fri, 9:00 AM – 5:00 PM</li>
</ul>
<h3>Location</h3>
<p>iLearningHubb operates in multiple communities. Contact us to find the nearest program.</p>
      `.trim(),
    },
    {
      key: 'faq',
      type: 'page',
      title: 'FAQ',
      content: `
<h2>Frequently Asked Questions</h2>
<h3>What ages do you serve?</h3>
<p>Our programs are designed for a range of age groups. Each program page lists the recommended age range.</p>
<h3>How do I enroll?</h3>
<p>Enrollment details are available on each program page. You can also contact us for assistance.</p>
<h3>Are programs in-person or online?</h3>
<p>We offer in-person programs and special online options depending on the season and location.</p>
<h3>What should my child bring?</h3>
<p>We’ll share a checklist after registration, tailored to the specific program.</p>
<h3>Do you offer refunds?</h3>
<p>Yes, refund policies vary by program and timing. Contact us for details.</p>
      `.trim(),
    },
    {
      key: 'terms',
      type: 'legal',
      title: 'Terms and Conditions',
      content: `
<h2>Terms and Conditions</h2>
<p>By using iLearningHubb services, you agree to these terms. Please read them carefully.</p>
<h3>Program Participation</h3>
<p>Participants must follow program guidelines and respect staff, peers, and facilities.</p>
<h3>Payments and Fees</h3>
<p>Fees are due at registration unless otherwise stated. Late payments may result in cancellation.</p>
<h3>Changes and Cancellations</h3>
<p>We reserve the right to adjust schedules or cancel programs due to unforeseen circumstances.</p>
<h3>Liability</h3>
<p>iLearningHubb is not responsible for personal belongings or incidents beyond reasonable control.</p>
      `.trim(),
    },
    {
      key: 'privacy',
      type: 'legal',
      title: 'Privacy Policy',
      content: `
<h2>Privacy Policy</h2>
<p>We respect your privacy and are committed to protecting personal information.</p>
<h3>Information We Collect</h3>
<p>We collect information needed to provide our services, such as contact details and registration data.</p>
<h3>How We Use Information</h3>
<p>We use data to manage programs, communicate updates, and improve our services.</p>
<h3>Sharing</h3>
<p>We do not sell personal data. We may share information only with trusted partners as required for service delivery.</p>
<h3>Security</h3>
<p>We apply industry-standard safeguards to protect stored information.</p>
      `.trim(),
    },
    {
      key: 'cookies',
      type: 'legal',
      title: 'Cookies Policy',
      content: `
<h2>Cookies Policy</h2>
<p>Our website uses cookies to enhance your experience.</p>
<h3>What Are Cookies?</h3>
<p>Cookies are small files stored on your device that help us remember preferences and analyze traffic.</p>
<h3>How We Use Cookies</h3>
<p>We use cookies for site functionality, analytics, and to improve content relevance.</p>
<h3>Managing Cookies</h3>
<p>You can control cookies through your browser settings. Disabling cookies may affect some features.</p>
      `.trim(),
    },
  ];

  for (const page of defaults) {
    const exists = await Page.findOne({ key: page.key, type: page.type }).lean();
    if (!exists) {
      await Page.create(page);
      continue;
    }

    if (!exists.content || exists.content.trim().length === 0) {
      await Page.updateOne(
        { _id: exists._id },
        { $set: { content: page.content, title: page.title } }
      );
    }
  }
}

mongoose.connection.on('open', () => {
  console.log('Connected to MongoDB');
});

module.exports = connectDB
