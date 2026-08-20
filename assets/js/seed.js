/**
 * seed.js — realistic demo data, written once on first load.
 *
 * Purpose:   enough volume and variety that search, sort, filter, pagination,
 *            approval queues and payout maths are all meaningful. Includes
 *            edge cases: very long titles, zero-review products, declined and
 *            cancelled records, an expired coupon, an empty vendor.
 * Depends:   db.js, business-rules.js
 *
 * The eleven products carrying Figma copy (Main Idea & Details, the six
 * preschool-math cards, the four You-Might-Also-Like tiles) are seeded with
 * the exact strings from the design so the replicated pages render real rows.
 *
 * TODO(backend): delete this file. Real environments seed from a fixture
 * migration, not the browser.
 */

import * as db from './db.js';
import { PLANS, CATEGORIES, GRADES, RESOURCE_TYPES, THEMES, FILE_TYPES, PROMO, settleLine, MIN_PAYOUT } from './business-rules.js';

const IMG = 'assets/img/';
const iso = (y, m, d, h = 10, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi)).toISOString();

/* ------------------------------------------------------------- vendors -- */

const VENDORS = [
  { id: 'v-1', slug: 'literacylane', storeName: 'LiteracyLane by Mrs. Reyes', owner: 'Amara Reyes',
    email: 'reyes@literacylane.com', planCode: 'premium', status: 'approved', followers: 143,
    logo: IMG + 'avatar-2.jpg', banner: IMG + 'cover-1.jpg', joinedAt: iso(2026, 1, 14),
    payoutMethod: 'PayPal', payoutAccount: 'reyes@literacylane.com', country: 'United States',
    bio: 'Reading specialist of eleven years, now writing differentiated comprehension sets for Muslim homeschools and Islamic weekend schools. Every passage is levelled three ways so one lesson reaches a whole mixed-ability room.' },
  { id: 'v-2', slug: 'sweet-preschool-creations', storeName: 'Sweet Preschool Creations', owner: 'Hafsa Siddiqui',
    email: 'hafsa@sweetpreschool.co', planCode: 'basic', status: 'approved', followers: 89,
    logo: IMG + 'vendor-logo-2.png', banner: IMG + 'cover-5.png', joinedAt: iso(2026, 2, 3),
    payoutMethod: 'Bank deposit', payoutAccount: 'HSBC ••••4471', country: 'United Kingdom',
    bio: 'Early-years printables for ages three to six. Counting, tracing and fine-motor packs built around Islamic themes so the youngest learners meet their deen while they learn their numbers.' },
  { id: 'v-3', slug: 'playful-learning-co', storeName: 'Playful Learning Co.', owner: 'Nadia Osman',
    email: 'nadia@playfullearning.co', planCode: 'basic', status: 'approved', followers: 61,
    logo: IMG + 'vendor-logo-3.png', banner: IMG + 'cover-6.png', joinedAt: iso(2026, 2, 19),
    payoutMethod: 'PayPal', payoutAccount: 'nadia@playfullearning.co', country: 'Canada',
    bio: 'Hands-on maths centres and sensory activities. I make the sort of resource you can set out on a Monday and leave running all week.' },
  { id: 'v-4', slug: 'the-kindergarten-hub', storeName: 'The Kindergarten Hub', owner: 'Yusra Karim',
    email: 'yusra@kindergartenhub.org', planCode: 'free', status: 'approved', followers: 34,
    logo: IMG + 'vendor-logo-4.png', banner: IMG + 'cover-7.png', joinedAt: iso(2026, 3, 8),
    payoutMethod: null, payoutAccount: null, country: 'United States',
    bio: 'Free shapes, colours and matching games for kindergarten. Everything I publish stays free — it is my sadaqah jariyah.' },
  { id: 'v-5', slug: 'miss-emilys-classroom', storeName: "Miss Emily's Classroom", owner: 'Emily Haddad',
    email: 'emily@missemilys.classroom', planCode: 'basic', status: 'approved', followers: 118,
    logo: IMG + 'vendor-logo-5.png', banner: IMG + 'cover-8.png', joinedAt: iso(2026, 3, 22),
    payoutMethod: 'Bank deposit', payoutAccount: 'Chase ••••9930', country: 'United States',
    bio: 'Themed pattern, sequencing and colouring sheets. Ocean, desert, Ramadan and Hajj units that print clean in black and white when the colour cartridge runs out.' },
  { id: 'v-6', slug: 'tiny-hands-learning', storeName: 'Tiny Hands Learning', owner: 'Ruqayyah Bello',
    email: 'ruqayyah@tinyhands.learning', planCode: 'premium', status: 'approved', followers: 207,
    logo: IMG + 'vendor-logo-1.png', banner: IMG + 'cover-9.png', joinedAt: iso(2026, 4, 2),
    payoutMethod: 'PayPal', payoutAccount: 'ruqayyah@tinyhands.learning', country: 'Nigeria',
    bio: 'Clip cards, number sense puzzles and Arabic letter work for toddlers and early learners. Laminate once, use for years.' },
  { id: 'v-7', slug: 'curriculum-and-crafts', storeName: 'Curriculum & Crafts', owner: 'Sumayyah Iqbal',
    email: 'sumayyah@curriculumcrafts.com', planCode: 'basic', status: 'approved', followers: 76,
    logo: IMG + 'vendor-logo-6.png', banner: IMG + 'cover-10.png', joinedAt: iso(2026, 5, 11),
    payoutMethod: 'PayPal', payoutAccount: 'sumayyah@curriculumcrafts.com', country: 'Pakistan',
    bio: 'Full unit plans with the craft built in. Seerah, Islamic geometry and STEM sets for co-ops and weekend schools.' },
  { id: 'v-8', slug: 'muslim-legacy-series', storeName: 'Muslim Legacy Series', owner: 'Bilal Haqq',
    email: 'contact@muslimlegacyseries.com', planCode: 'publishers', status: 'pending', followers: 0,
    logo: IMG + 'vendor-logo-1.png', banner: null, joinedAt: iso(2026, 7, 29),
    payoutMethod: 'Bank deposit', payoutAccount: 'Emirates NBD ••••2210', country: 'United Arab Emirates',
    bio: 'Publishing house producing full-year Islamic Studies and Arabic curricula for schools. Sixty titles in print, moving our digital catalogue to Uloominate.' },
];

/* --------------------------------------------------------------- users -- */

const USERS = [
  { id: 'u-admin', role: 'admin', firstName: 'Khadija', lastName: 'Quadri',
    email: 'admin@uloominate.com', password: 'admin1234', avatar: null, status: 'active', joinedAt: iso(2025, 11, 2) },
  ...VENDORS.map((v, i) => ({
    id: 'u-' + v.id, role: 'vendor', vendorId: v.id,
    firstName: v.owner.split(' ')[0], lastName: v.owner.split(' ').slice(1).join(' '),
    email: v.email, password: 'vendor1234', avatar: v.logo,
    status: v.status === 'suspended' ? 'suspended' : 'active', joinedAt: v.joinedAt,
  })),
  { id: 'u-c1', role: 'customer', firstName: 'Aisha', lastName: 'Rahman', email: 'aisha.rahman@example.com',
    password: 'customer1234', avatar: IMG + 'avatar-1.jpg', status: 'active', joinedAt: iso(2026, 2, 12),
    roleLabel: '3rd Grade Teacher' },
  { id: 'u-c2', role: 'customer', firstName: 'Maryam', lastName: 'Patterson', email: 'm.patterson@example.com',
    password: 'customer1234', avatar: IMG + 'avatar-1.jpg', status: 'active', joinedAt: iso(2026, 1, 30),
    roleLabel: '3rd Grade Teacher' },
  { id: 'u-c3', role: 'customer', firstName: 'Luis', lastName: 'Dominguez', email: 'l.dominguez@example.com',
    password: 'customer1234', avatar: IMG + 'avatar-2.jpg', status: 'active', joinedAt: iso(2026, 3, 4),
    roleLabel: '4th Grade Teacher' },
  { id: 'u-c4', role: 'customer', firstName: 'Wei', lastName: 'Chen', email: 'w.chen@example.com',
    password: 'customer1234', avatar: IMG + 'avatar-3.jpg', status: 'active', joinedAt: iso(2026, 4, 18),
    roleLabel: '2nd Grade Teacher' },
  { id: 'u-c5', role: 'customer', firstName: 'Fatima', lastName: 'Bakr', email: 'fatima.bakr@example.com',
    password: 'customer1234', avatar: null, status: 'active', joinedAt: iso(2026, 6, 21),
    roleLabel: 'Homeschool Parent' },
  { id: 'u-c6', role: 'customer', firstName: 'Idris', lastName: 'Mahmood', email: 'idris.mahmood@example.com',
    password: 'customer1234', avatar: null, status: 'active', joinedAt: iso(2026, 7, 9),
    roleLabel: 'Weekend School Coordinator' },
];

/* ------------------------------------------------------------ products -- */

const cat = slug => CATEGORIES.find(c => c.slug === slug).id;

// The eleven products whose copy is fixed by the Figma design.
const DESIGN_PRODUCTS = [
  { id: 'p-main', vendorId: 'v-1', status: 'approved',
    title: 'Main Idea & Details — Nonfiction Passages, Grades 3–5 (Differentiated)',
    price: 9.00, originalPrice: 12.00,
    categoryId: cat('ela'), subject: 'Reading Comprehension', resourceType: 'Worksheets',
    gradeFrom: '3rd Grade', gradeTo: '5th Grade', theme: 'Everyday',
    fileType: 'PDF + Google Slides', pageCount: 49, fileSizeMb: 8.4,
    tags: ['ELA', 'Reading', 'Nonfiction', 'Grades 3–5', 'CCSS Aligned', 'Digital'],
    cover: IMG + 'preview-1.jpg',
    gallery: [IMG + 'preview-1.jpg', IMG + 'preview-2.jpg', IMG + 'preview-3.jpg', IMG + 'preview-4.jpg', IMG + 'preview-5.jpg'],
    downloads: 12841, ratingAvg: 4.9, ratingCount: 3847,
    ratingBreakdown: { 5: 89, 4: 8, 3: 2, 2: 1, 1: 0 },
    description: 'This Main Idea & Details resource set gives students structured practice identifying central ideas and the supporting details that hold them up, across twelve original nonfiction passages.\n\nEach passage is carefully leveled and features high-interest nonfiction content that keeps readers engaged while they build the skill.',
    includedHeading: 'What teachers love about this resource:',
    included: [
      'Three differentiated versions (on-level, below-level, challenge)',
      'Graphic organizer + short-answer response format',
      'Answer keys included for every passage',
      'Works in centers, whole-class, small group, or homework',
      'Print-and-go — no prep required',
    ],
    publishedAt: iso(2024, 11, 12), lastUpdated: iso(2024, 11, 12) },

  { id: 'p-b1', vendorId: 'v-2', status: 'approved',
    title: 'Preschool Math Worksheet Pack: Numbers 1-10 Counting & Tracing Bundle',
    price: 4.50, originalPrice: 6.00, categoryId: cat('math'), subject: 'Counting',
    resourceType: 'Worksheets', gradeFrom: 'Pre-K', gradeTo: 'Kindergarten', theme: 'Everyday',
    fileType: 'PDF', pageCount: 32, fileSizeMb: 5.1, cover: IMG + 'cover-5.png',
    downloads: 2140, ratingAvg: 5, ratingCount: 142, publishedAt: iso(2026, 3, 4) },
  { id: 'p-b2', vendorId: 'v-3', status: 'approved',
    title: 'Apple Tree Counting: Interactive Hands-On Autumn Math Centers',
    price: 3.20, categoryId: cat('math'), subject: 'Counting', resourceType: 'Activities',
    gradeFrom: 'Pre-K', gradeTo: '1st Grade', theme: 'Seasonal',
    fileType: 'PDF', pageCount: 24, fileSizeMb: 12.6, cover: IMG + 'cover-6.png',
    downloads: 1180, ratingAvg: 5, ratingCount: 89, publishedAt: iso(2026, 3, 18) },
  { id: 'p-b3', vendorId: 'v-4', status: 'approved',
    title: 'Shapes Matching Game & Clip Cards: Circle, Triangle, Square Activities',
    price: 0, categoryId: cat('math'), subject: 'Geometry', resourceType: 'Games',
    gradeFrom: 'Pre-K', gradeTo: 'Kindergarten', theme: 'Everyday',
    fileType: 'PDF', pageCount: 18, fileSizeMb: 4.2, cover: IMG + 'cover-7.png',
    downloads: 5602, ratingAvg: 5, ratingCount: 203, publishedAt: iso(2026, 4, 1) },
  { id: 'p-b4', vendorId: 'v-5', status: 'approved',
    title: 'Ocean Theme Pattern Coloring & Sequencing Activity Sheets',
    price: 2.80, categoryId: cat('math'), subject: 'Counting', resourceType: 'Printables',
    gradeFrom: 'Pre-K', gradeTo: 'Kindergarten', theme: 'Seasonal',
    fileType: 'PDF', pageCount: 20, fileSizeMb: 6.8, cover: IMG + 'cover-8.png',
    downloads: 940, ratingAvg: 5, ratingCount: 56, publishedAt: iso(2026, 4, 15) },
  { id: 'p-b5', vendorId: 'v-6', status: 'approved',
    title: 'Preschool Math Clip Cards: Ocean Creatures Counting & Number Sense',
    price: 3.50, categoryId: cat('math'), subject: 'Counting', resourceType: 'Flash Cards',
    gradeFrom: 'Pre-K', gradeTo: '1st Grade', theme: 'Everyday',
    fileType: 'PDF', pageCount: 28, fileSizeMb: 9.3, cover: IMG + 'cover-9.png',
    downloads: 1320, ratingAvg: 5, ratingCount: 74, publishedAt: iso(2026, 5, 2) },
  { id: 'p-b6', vendorId: 'v-7', status: 'approved',
    title: 'Number Sense Matching Puzzles for Toddlers & Early Learners',
    price: 5.00, originalPrice: 7.50, categoryId: cat('math'), subject: 'Counting',
    resourceType: 'Games', gradeFrom: 'Pre-K', gradeTo: 'Kindergarten', theme: 'Everyday',
    fileType: 'PDF', pageCount: 36, fileSizeMb: 11.2, cover: IMG + 'cover-10.png',
    downloads: 1760, ratingAvg: 5, ratingCount: 112, publishedAt: iso(2026, 5, 20) },

  { id: 'p-r1', vendorId: 'v-1', status: 'approved',
    title: 'Reading Comprehension Bundle — Grades 3-5', price: 14.00,
    categoryId: cat('ela'), subject: 'Reading Comprehension', resourceType: 'Workbooks',
    gradeFrom: '3rd Grade', gradeTo: '5th Grade', theme: 'Everyday',
    fileType: 'PDF + Google Slides', pageCount: 148, fileSizeMb: 26.4, cover: IMG + 'cover-1.jpg',
    downloads: 7420, ratingAvg: 4.8, ratingCount: 2341, publishedAt: iso(2026, 1, 22) },
  { id: 'p-r2', vendorId: 'v-1', status: 'approved',
    title: 'Phonics Fluency Passages — First Grade', price: 7.50,
    categoryId: cat('ela'), subject: 'Phonics', resourceType: 'Worksheets',
    gradeFrom: 'Kindergarten', gradeTo: '2nd Grade', theme: 'Everyday',
    fileType: 'PDF', pageCount: 64, fileSizeMb: 10.1, cover: IMG + 'cover-2.jpg',
    downloads: 5210, ratingAvg: 4.9, ratingCount: 1872, publishedAt: iso(2026, 2, 9) },
  { id: 'p-r3', vendorId: 'v-7', status: 'approved',
    title: 'Math Word Problems Task Cards — 3rd Grade', price: 5.00,
    categoryId: cat('math'), subject: 'Addition', resourceType: 'Flash Cards',
    gradeFrom: '2nd Grade', gradeTo: '4th Grade', theme: 'Everyday',
    fileType: 'PDF', pageCount: 40, fileSizeMb: 7.7, cover: IMG + 'cover-3.jpg',
    downloads: 3180, ratingAvg: 4.7, ratingCount: 988, publishedAt: iso(2026, 3, 12) },
  { id: 'p-r4', vendorId: 'v-5', status: 'approved',
    title: 'Writing Workshop Mini-Lessons — Full Year', price: 22.00,
    categoryId: cat('ela'), subject: 'Writing', resourceType: 'Unit Plans',
    gradeFrom: '3rd Grade', gradeTo: '6th Grade', theme: 'Everyday',
    fileType: 'PDF + Google Slides', pageCount: 210, fileSizeMb: 34.8, cover: IMG + 'cover-4.jpg',
    downloads: 1490, ratingAvg: 4.6, ratingCount: 456, publishedAt: iso(2026, 4, 26) },
];

// A broader Islamic-education catalogue, generated with deterministic variety.
const CATALOGUE = [
  ['Aqeedah Foundations: The Six Pillars of Iman Unit Study', 'v-8', 'islamic-studies', 'Aqeedah', 'Unit Plans', '4th Grade', '7th Grade', 18.00, null, 'approved'],
  ['Seerah Timeline Posters — Makkan and Madinan Periods', 'v-7', 'islamic-studies', 'Seerah', 'Posters', '3rd Grade', '8th Grade', 6.50, 9.00, 'approved'],
  ['My First Duas: Tracing and Colouring Book', 'v-2', 'islamic-studies', 'Duas & Adhkar', 'Printables', 'Pre-K', '1st Grade', 0, null, 'approved'],
  ['Adab of the Muslim Child — 30 Character Lessons', 'v-7', 'islamic-studies', 'Adab & Manners', 'Lesson Plans', '1st Grade', '5th Grade', 12.00, null, 'approved'],
  ['Fiqh of Salah: Step-by-Step Visual Guide and Worksheets', 'v-8', 'islamic-studies', 'Fiqh', 'Worksheets', '2nd Grade', '6th Grade', 8.00, null, 'pending'],
  ['Ramadan Reflection Journal for Young Muslims', 'v-5', 'islamic-studies', 'Adab & Manners', 'Workbooks', '3rd Grade', '8th Grade', 4.00, 6.00, 'approved'],

  ['Juz Amma Memorisation Tracker and Reward Charts', 'v-6', 'quran', 'Memorisation', 'Printables', 'Kindergarten', '6th Grade', 3.00, null, 'approved'],
  ['Tajweed Rules Made Simple: Colour-Coded Reference Cards', 'v-8', 'quran', 'Tajweed', 'Flash Cards', '4th Grade', 'Adult', 9.50, null, 'approved'],
  ['Surah Al-Fatihah Word-by-Word Study Pack', 'v-7', 'quran', 'Tafsir', 'Worksheets', '2nd Grade', '5th Grade', 5.00, null, 'approved'],
  ['Quran Stories Comprehension Set: Prophets in the Quran', 'v-1', 'quran', 'Tafsir', 'Worksheets', '3rd Grade', '6th Grade', 7.00, null, 'approved'],
  ['Daily Quran Reading Log — Whole Year Bundle', 'v-4', 'quran', 'Memorisation', 'Printables', '1st Grade', 'High School', 0, null, 'approved'],

  ['Arabic Alphabet Playdough Mats and Tracing Strips', 'v-2', 'arabic', 'Alphabet', 'Activities', 'Pre-K', '1st Grade', 4.50, null, 'approved'],
  ['Arabic Vocabulary Builder: 300 Everyday Words with Images', 'v-6', 'arabic', 'Vocabulary', 'Flash Cards', '1st Grade', '6th Grade', 11.00, 14.00, 'approved'],
  ['Nahw Basics: Introduction to Arabic Grammar Workbook', 'v-8', 'arabic', 'Grammar (Nahw)', 'Workbooks', '6th Grade', 'Adult', 16.00, null, 'pending'],
  ['Arabic Handwriting Practice — Naskh Script Sheets', 'v-3', 'arabic', 'Handwriting', 'Worksheets', 'Kindergarten', '4th Grade', 3.50, null, 'approved'],
  ['Read Arabic in 30 Days: Structured Daily Lessons', 'v-8', 'arabic', 'Reading', 'Lesson Plans', '3rd Grade', 'Adult', 19.00, null, 'declined'],

  ['Islamic History Map Work: The Spread of Islam 610–750 CE', 'v-7', 'social-studies', 'Islamic History', 'Activities', '5th Grade', 'High School', 8.50, null, 'approved'],
  ['World Cultures of the Muslim World — Research Project Pack', 'v-5', 'social-studies', 'World Cultures', 'Unit Plans', '4th Grade', '8th Grade', 10.00, null, 'approved'],
  ['Community Helpers in Our Masjid — Early Years Social Studies', 'v-2', 'social-studies', 'Civics', 'Printables', 'Pre-K', '1st Grade', 2.50, null, 'approved'],
  ['Geography of the Hajj Journey: Mapping Activities', 'v-7', 'social-studies', 'Geography', 'Worksheets', '3rd Grade', '6th Grade', 5.50, 7.00, 'approved'],

  ['Multiplication Fact Fluency Games — Times Tables 1 to 12', 'v-3', 'math', 'Multiplication', 'Games', '2nd Grade', '5th Grade', 6.00, null, 'approved'],
  ['Fractions on a Number Line: Visual Models and Practice', 'v-1', 'math', 'Fractions', 'Worksheets', '3rd Grade', '5th Grade', 4.75, null, 'approved'],
  ['Islamic Geometric Patterns Meet Symmetry — STEAM Unit', 'v-7', 'math', 'Geometry', 'Unit Plans', '4th Grade', '8th Grade', 13.50, null, 'approved'],
  ['Subtraction With Regrouping — Scaffolded Practice Pages', 'v-5', 'math', 'Subtraction', 'Worksheets', '1st Grade', '3rd Grade', 3.75, null, 'approved'],
  ['Long Division Step Cards and Error-Analysis Tasks', 'v-6', 'math', 'Division', 'Flash Cards', '4th Grade', '6th Grade', 5.25, null, 'draft'],

  ['The Water Cycle: Signs of Allah in Nature Science Unit', 'v-7', 'science', 'Earth Science', 'Unit Plans', '3rd Grade', '6th Grade', 9.00, null, 'approved'],
  ['Life Cycles Interactive Notebook — Plants and Animals', 'v-3', 'science', 'Life Science', 'Activities', '2nd Grade', '5th Grade', 7.25, null, 'approved'],
  ['Simple Machines STEM Challenge Cards', 'v-6', 'science', 'STEM', 'Activities', '3rd Grade', '7th Grade', 6.75, 8.50, 'approved'],
  ['States of Matter Lab Sheets and Vocabulary Wall', 'v-5', 'science', 'Physical Science', 'Worksheets', '2nd Grade', '5th Grade', 4.25, null, 'unpublished'],

  ['Sight Word Fluency Ladders — Pre-Primer to Third Grade', 'v-1', 'ela', 'Vocabulary', 'Printables', 'Kindergarten', '3rd Grade', 8.00, null, 'approved'],
  ['Narrative Writing Prompts With Islamic Themes — 60 Cards', 'v-5', 'ela', 'Writing', 'Flash Cards', '3rd Grade', '7th Grade', 5.50, null, 'approved'],
  ['Grammar Grab Bag: Parts of Speech Centres', 'v-3', 'ela', 'Grammar', 'Games', '2nd Grade', '5th Grade', 6.25, null, 'approved'],
  ['Close Reading Passages: Hadith of the Week, Full Year Set (36 Weeks of Differentiated Passages, Comprehension Questions, Vocabulary Work and Answer Keys)', 'v-1', 'ela', 'Reading Comprehension', 'Workbooks', '4th Grade', '8th Grade', 24.00, 32.00, 'approved'],

  ['Islamic Geometric Art: Compass and Ruler Construction Pack', 'v-7', 'art', 'Islamic Geometric Art', 'Activities', '5th Grade', 'High School', 11.50, null, 'approved'],
  ['Arabic Calligraphy for Beginners — Thuluth Practice Sheets', 'v-8', 'art', 'Calligraphy', 'Worksheets', '6th Grade', 'Adult', 14.00, null, 'pending'],
  ['Eid Craft Bundle: Cards, Bunting and Gift Tags', 'v-2', 'art', 'Crafts', 'Printables', 'Pre-K', '4th Grade', 4.00, null, 'approved'],
  ['Masjid Colouring Pages From Around the World', 'v-4', 'art', 'Colouring', 'Printables', 'Pre-K', '3rd Grade', 0, null, 'approved'],

  ['Halal Nutrition and Healthy Eating Unit for Primary', 'v-5', 'health', 'Nutrition', 'Unit Plans', '1st Grade', '5th Grade', 7.00, null, 'approved'],
  ['Feelings and Fitrah: Social-Emotional Learning Cards', 'v-6', 'health', 'Social & Emotional', 'Flash Cards', 'Kindergarten', '4th Grade', 6.50, null, 'approved'],
  ['Wudu and Personal Hygiene Visual Routine Charts', 'v-2', 'health', 'Wellbeing', 'Posters', 'Pre-K', '2nd Grade', 2.00, null, 'approved'],
  ['Active Breaks for the Islamic Classroom — 40 Movement Cards', 'v-3', 'health', 'Physical Education', 'Activities', 'Kindergarten', '6th Grade', 3.25, null, 'declined'],
];

const DESCRIPTIONS = [
  'Built for mixed-ability classrooms and homeschool tables alike. Everything prints clean in greyscale, so it still works when the colour cartridge gives up mid-lesson.',
  'Written after three years of running this material with real students. The pacing, the question order and the answer keys all reflect what actually held attention in the room.',
  'Each section stands alone, so you can pull a single page for a Friday filler or run the whole sequence as a half-term unit.',
  'Includes a teacher guide with suggested pacing, differentiation notes, and a short list of common misconceptions to watch for.',
  'Designed to be laminated once and reused for years. Cutting guides are included on every card sheet.',
];

const INCLUDED_SETS = [
  ['Full-colour and printer-friendly versions of every page', 'Answer keys for all tasks', 'Teacher pacing guide', 'Editable cover page'],
  ['Three differentiation levels', 'Student reflection sheet', 'Assessment rubric', 'Parent letter template'],
  ['Cutting and laminating guides', 'Storage label sheet', 'Extension activity ideas', 'Digital Google Slides version'],
  ['Weekly planning overview', 'Vocabulary word wall cards', 'Home practice sheets', 'Certificate of completion'],
];

const COVERS = ['cover-1.jpg', 'cover-2.jpg', 'cover-3.jpg', 'cover-4.jpg', 'cover-5.png',
  'cover-6.png', 'cover-7.png', 'cover-8.png', 'cover-9.png', 'cover-10.png'];

function buildCatalogue() {
  return CATALOGUE.map((row, i) => {
    const [title, vendorId, catSlug, subject, resourceType, gradeFrom, gradeTo, price, originalPrice, status] = row;
    const c = CATEGORIES.find(x => x.slug === catSlug);
    const seed = i * 7 + 3;
    const cover = IMG + COVERS[i % COVERS.length];
    const ratingCount = status === 'approved' ? (seed * 13) % 480 + (price === 0 ? 120 : 4) : 0;
    return {
      id: 'p-c' + (i + 1), vendorId, status, title,
      price, originalPrice: originalPrice || null,
      categoryId: c.id, subject, resourceType,
      gradeFrom, gradeTo, theme: THEMES[seed % THEMES.length],
      fileType: FILE_TYPES[seed % FILE_TYPES.length],
      pageCount: 12 + (seed * 5) % 180,
      fileSizeMb: Math.round((2 + (seed % 40) * 0.9) * 10) / 10,
      cover, gallery: [cover, IMG + COVERS[(i + 3) % COVERS.length], IMG + COVERS[(i + 6) % COVERS.length]],
      downloads: status === 'approved' ? (seed * 137) % 6400 + 42 : 0,
      ratingAvg: ratingCount ? Math.round((3.9 + (seed % 11) / 10) * 10) / 10 : 0,
      ratingCount,
      description: DESCRIPTIONS[seed % DESCRIPTIONS.length],
      includedHeading: 'What is inside this resource:',
      included: INCLUDED_SETS[seed % INCLUDED_SETS.length],
      tags: [c.name, subject, resourceType, gradeFrom + ' – ' + gradeTo],
      publishedAt: status === 'approved' ? iso(2026, 1 + (i % 7), 2 + (i % 26)) : null,
      submittedAt: iso(2026, 6 + (i % 2), 1 + (i % 27)),
      lastUpdated: iso(2026, 6 + (i % 2), 3 + (i % 25)),
      declineReason: status === 'declined'
        ? 'Preview images are low quality or misleading' : null,
      declineNote: status === 'declined'
        ? 'The three preview pages do not match the described contents. Please re-export at 150 DPI and confirm the page count before resubmitting.' : null,
    };
  });
}

function normaliseProduct(p) {
  const c = CATEGORIES.find(x => x.id === p.categoryId);
  return Object.assign({
    originalPrice: null, theme: 'Everyday', gallery: [p.cover], downloads: 0,
    ratingAvg: 0, ratingCount: 0, ratingBreakdown: null,
    description: DESCRIPTIONS[0], includedHeading: 'What is inside this resource:',
    included: INCLUDED_SETS[0], tags: [c ? c.name : '', p.subject, p.resourceType].filter(Boolean),
    submittedAt: p.publishedAt, lastUpdated: p.publishedAt, declineReason: null, declineNote: null,
    fileKey: null, fileName: p.title.slice(0, 40).trim().replace(/[^\w -]/g, '') + '.pdf',
  }, p);
}

/* -------------------------------------------------------------- orders -- */

function buildOrders(products) {
  const buyers = USERS.filter(u => u.role === 'customer');
  const sellable = products.filter(p => p.status === 'approved');
  const orders = [];
  // A digital resource can only be bought once per account, so track what each
  // buyer already owns rather than letting the loop resell it.
  const owned = {};
  buyers.forEach(b => { owned[b.id] = new Set(); });
  let seq = 0;

  // Volume matters: with only a few dozen orders no vendor clears the $25
  // payout minimum in a month, and every financial screen reads empty.
  for (let i = 0; i < 320; i++) {
    const buyer = buyers[i % buyers.length];
    const want = 1 + (i % 3);
    const items = [];
    for (let k = 0; k < want; k++) {
      // Walk forward until an unowned resource turns up.
      for (let probe = 0; probe < sellable.length; probe++) {
        const p = sellable[(i * 5 + k * 11 + probe) % sellable.length];
        if (owned[buyer.id].has(p.id) || items.some(it => it.productId === p.id)) continue;
        items.push({
          productId: p.id, vendorId: p.vendorId, title: p.title,
          price: p.price, cover: p.cover, planCode: VENDORS.find(v => v.id === p.vendorId).planCode,
        });
        break;
      }
    }
    if (!items.length) continue; // this buyer owns the whole catalogue
    const total = items.reduce((s, it) => s + it.price, 0);
    const status = i % 41 === 4 ? 'refunded' : i % 53 === 11 ? 'cancelled' : i % 67 === 25 ? 'failed' : 'completed';
    // Only a completed order confers ownership.
    if (status === 'completed') items.forEach(it => owned[buyer.id].add(it.productId));
    const month = 1 + (i % 8);
    seq++;
    orders.push({
      id: 'o-' + String(1000 + seq),
      reference: 'ULM-' + (26000 + seq),
      customerId: buyer.id, customerName: buyer.firstName + ' ' + buyer.lastName,
      customerEmail: buyer.email,
      items, subtotal: round2(total), discount: 0, total: round2(total),
      status, paymentMethod: i % 3 === 0 ? 'PayPal' : 'Card ••••4242',
      placedAt: iso(2026, month, 1 + (i % 27), 9 + (i % 9), (i * 7) % 60),
    });
  }
  return orders;
}

/* ------------------------------------------------------------- reviews -- */

const REVIEW_BODIES = [
  'Absolutely love this resource! My students were so engaged during the lesson and the differentiated versions made it easy to reach everyone in my class. The graphic organizers are exactly what I was looking for.',
  'This is exactly what I needed for my reading centers. The answer key was a huge time saver and the passages held my class\u2019s attention right through to Friday.',
  'Great resource overall. I did have to adjust the font size for my struggling readers, but the content itself is strong and the structure is easy to follow.',
  'Printed beautifully in black and white which matters in our co-op. Everything was laid out clearly and the pacing guide saved me an evening of planning.',
  'My daughter asked to do the next page without being told. That has never happened with a worksheet before.',
  'Used this across two weekend-school classes. Both teachers said the same thing: no prep needed, and the children stayed with it.',
  'Solid value for the price. I would like a few more challenge pages, but what is here works well as it stands.',
];

function buildReviews(products, orders) {
  const reviewers = USERS.filter(u => u.role === 'customer');
  const named = [
    { productId: 'p-main', userId: 'u-c2', name: 'Ms. Patterson', roleLabel: '3rd Grade Teacher',
      rating: 5, body: REVIEW_BODIES[0], avatar: IMG + 'avatar-1.jpg', createdAt: iso(2024, 9, 14) },
    { productId: 'p-main', userId: 'u-c3', name: 'Mr. Dominguez', roleLabel: '4th Grade Teacher',
      rating: 5, body: REVIEW_BODIES[1], avatar: IMG + 'avatar-2.jpg', createdAt: iso(2024, 10, 8) },
    { productId: 'p-main', userId: 'u-c4', name: 'Mrs. Chen', roleLabel: '2nd Grade Teacher',
      rating: 4, body: REVIEW_BODIES[2], avatar: IMG + 'avatar-3.jpg', createdAt: iso(2024, 11, 3) },
  ];
  const rest = [];
  // Extra reviews on the design product so review paging is exercised (the
  // Figma page shows three and a "See all …" control).
  for (let i = 0; i < 9; i++) {
    const u = reviewers[(i + 2) % reviewers.length];
    rest.push({
      productId: 'p-main', userId: u.id, name: u.firstName + ' ' + u.lastName,
      roleLabel: u.roleLabel || 'Educator', avatar: u.avatar,
      rating: [5, 5, 4, 5, 5, 4, 5, 3, 5][i],
      body: REVIEW_BODIES[(i + 1) % REVIEW_BODIES.length],
      createdAt: iso(2026, 1 + (i % 7), 3 + (i % 24)),
    });
  }
  const sellable = products.filter(p => p.status === 'approved' && p.id !== 'p-main');
  for (let i = 0; i < 64; i++) {
    const p = sellable[(i * 3) % sellable.length];
    const u = reviewers[i % reviewers.length];
    rest.push({
      productId: p.id, userId: u.id, name: u.firstName + ' ' + u.lastName,
      roleLabel: u.roleLabel || 'Educator', avatar: u.avatar,
      rating: [5, 5, 5, 4, 5, 4, 3][i % 7],
      body: REVIEW_BODIES[(i + 3) % REVIEW_BODIES.length],
      createdAt: iso(2026, 1 + (i % 7), 2 + (i % 26)),
    });
  }
  return named.concat(rest).map((r, i) => Object.assign({ id: 'r-' + (i + 1), status: 'published' }, r));
}

/* ------------------------------------------------------------- payouts -- */

/**
 * Payouts must reconcile with the orders, or a vendor dashboard shows a
 * withdrawable balance of zero while claiming lifetime earnings. For each
 * vendor we settle their real order lines, then pay out roughly two thirds of
 * that across monthly runs and leave the remainder withdrawable.
 */
function buildPayouts(products, orders) {
  const rows = [];
  let n = 0;

  for (const v of VENDORS.filter(x => x.status === 'approved' && x.payoutMethod)) {
    // Earnings by calendar month, from completed orders only.
    const byMonth = {};
    for (const o of orders) {
      if (o.status !== 'completed') continue;
      for (const it of o.items) {
        if (it.vendorId !== v.id) continue;
        const split = settleLine({ price: it.price, planCode: v.planCode });
        const key = o.placedAt.slice(0, 7);
        byMonth[key] = (byMonth[key] || 0) + split.vendorEarnings;
      }
    }

    const months = Object.keys(byMonth).sort();
    if (!months.length) continue;

    // Leave the most recent month unpaid so there is always a live balance.
    const payable = months.slice(0, Math.max(1, months.length - 1));

    for (const key of payable) {
      const amount = round2(byMonth[key]);
      if (amount < MIN_PAYOUT) continue;
      n++;
      const [y, m] = key.split('-').map(Number);
      const label = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'][m - 1];
      const pending = n % 8 === 0;
      const processing = !pending && n % 7 === 0;
      rows.push({
        id: 'po-' + n, vendorId: v.id, period: label + ' ' + y,
        amount,
        method: v.payoutMethod, account: v.payoutAccount,
        status: pending ? 'pending' : processing ? 'processing' : 'paid',
        requestedAt: iso(y, m, 28),
        paidAt: pending || processing ? null : iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 5),
      });
    }
  }
  return rows;
}

/* ------------------------------------------------------------- coupons -- */

function buildCoupons() {
  return [
    { id: 'cp-1', vendorId: 'v-1', code: 'LITERACY15', type: 'percent', value: 15, minSpend: 10,
      usageLimit: 200, used: 47, expiresAt: iso(2026, 12, 31), status: 'active' },
    { id: 'cp-2', vendorId: 'v-1', code: 'BUNDLE5', type: 'fixed', value: 5, minSpend: 20,
      usageLimit: 100, used: 12, expiresAt: iso(2026, 10, 31), status: 'active' },
    { id: 'cp-3', vendorId: 'v-2', code: 'PRESCHOOL10', type: 'percent', value: 10, minSpend: 0,
      usageLimit: 500, used: 218, expiresAt: iso(2026, 9, 30), status: 'active' },
    { id: 'cp-4', vendorId: 'v-5', code: 'RAMADAN25', type: 'percent', value: 25, minSpend: 8,
      usageLimit: 300, used: 300, expiresAt: iso(2026, 4, 10), status: 'exhausted' },
    { id: 'cp-5', vendorId: 'v-6', code: 'TINYHANDS20', type: 'percent', value: 20, minSpend: 5,
      usageLimit: 150, used: 33, expiresAt: iso(2026, 3, 1), status: 'expired' },
    { id: 'cp-6', vendorId: 'v-7', code: 'CRAFT3', type: 'fixed', value: 3, minSpend: 12,
      usageLimit: null, used: 9, expiresAt: iso(2027, 1, 31), status: 'active' },
    { id: 'cp-7', vendorId: 'v-3', code: 'PLAYFUL2026', type: 'percent', value: 12, minSpend: 0,
      usageLimit: 250, used: 0, expiresAt: iso(2026, 12, 1), status: 'active' },
  ];
}

/* ------------------------------------------------------- subscriptions -- */

function buildSubscriptions() {
  return VENDORS.map((v, i) => ({
    id: 'sub-' + (i + 1), vendorId: v.id, planCode: v.planCode,
    status: v.status === 'approved' ? 'active' : 'pending',
    promoActive: true, freeUntil: PROMO.freeUntil, nextBillingDate: PROMO.billingStarts,
    nextBillingAmount: (PLANS.find(p => p.code === v.planCode) || {}).annualFee ?? null,
    paymentMethod: v.planCode === 'free' ? null : 'Card ••••' + (4242 + i),
    paymentExpiry: v.planCode === 'free' ? null : '0' + (2 + i % 8) + '/29',
    startedAt: v.joinedAt, cancelledAt: null,
  }));
}

/* ------------------------------------------------------- notifications -- */

function buildNotifications(products, orders) {
  const rows = [];
  let n = 0;
  const push = (userId, type, title, body, at, link) =>
    rows.push({ id: 'n-' + (++n), userId, type, title, body, createdAt: at, read: n > 6, link: link || null });

  push('u-v-8', 'vendor_registration', 'Registration received',
    'Your vendor registration is with an administrator for review against our content standard.', iso(2026, 7, 29));
  push('u-admin', 'vendor_pending', 'New vendor awaiting review',
    'Muslim Legacy Series registered on the Publishers tier and is waiting for approval.', iso(2026, 7, 29));
  push('u-admin', 'product_pending', '3 products awaiting review',
    'Fiqh of Salah, Nahw Basics and Arabic Calligraphy for Beginners are in the moderation queue.', iso(2026, 8, 1));
  push('u-v-1', 'sale', 'You made a sale',
    'Main Idea & Details — Nonfiction Passages sold for $9.00. Your earnings: $6.95.', iso(2026, 8, 4));
  push('u-v-1', 'payout', 'Payout issued',
    'Your June 2026 payout of $412.60 has been sent to PayPal.', iso(2026, 7, 5));
  push('u-v-2', 'product_approved', 'Product approved',
    'Preschool Math Worksheet Pack is now live on the storefront.', iso(2026, 3, 5));
  push('u-v-8', 'billing_transition', 'Billing begins 2 January 2027',
    'Your founding-offer period ends on 1 January 2027. Paid billing for the Publishers tier starts the following day.', iso(2026, 8, 2));
  push('u-c1', 'order', 'Your resources are ready',
    'Order ULM-26003 is complete. Download your files any time from your account.', iso(2026, 6, 18));
  push('u-v-5', 'product_declined', 'Product declined',
    'Active Breaks for the Islamic Classroom was declined: preview images are low quality or misleading.', iso(2026, 7, 14));
  return rows;
}

/* ---------------------------------------------------------------- seed -- */

export function seedAll(force = false) {
  if (db.isSeeded() && !force) return false;
  if (force) db.reset();

  const products = DESIGN_PRODUCTS.concat(buildCatalogue()).map(normaliseProduct);
  const orders = buildOrders(products);
  const reviews = buildReviews(products, orders);

  db.loadCollection('plans', PLANS.map(p => Object.assign({}, p)));
  db.loadCollection('categories', CATEGORIES.map(c => Object.assign({}, c)));
  db.loadCollection('users', USERS.map(u => Object.assign({}, u)));
  db.loadCollection('vendors', VENDORS.map(v => Object.assign({}, v)));
  db.loadCollection('products', products);
  db.loadCollection('orders', orders);
  db.loadCollection('reviews', reviews);
  db.loadCollection('payouts', buildPayouts(products, orders));
  db.loadCollection('coupons', buildCoupons());
  db.loadCollection('subscriptions', buildSubscriptions());
  db.loadCollection('notifications', buildNotifications(products, orders));
  db.loadCollection('wishlist', [
    { id: 'w-1', userId: 'u-c1', productId: 'p-r1', createdAt: iso(2026, 6, 2) },
    { id: 'w-2', userId: 'u-c1', productId: 'p-b3', createdAt: iso(2026, 6, 9) },
    { id: 'w-3', userId: 'u-c1', productId: 'p-c7', createdAt: iso(2026, 7, 1) },
  ]);
  db.loadCollection('follows', [
    { id: 'f-1', userId: 'u-c1', vendorId: 'v-1', createdAt: iso(2026, 3, 3) },
    { id: 'f-2', userId: 'u-c1', vendorId: 'v-6', createdAt: iso(2026, 5, 14) },
  ]);
  db.loadCollection('cart', []);
  db.loadCollection('subscribers', SUBSCRIBERS);
  db.loadCollection('messages', MESSAGES);
  db.loadCollection('media', []);
  db.loadCollection('pages', CONTENT_PAGES);
  db.loadCollection('settings', [
    { id: 'set-launch', key: 'launchMode', value: 'pre-launch',
      label: 'Storefront gating', help: 'Pre-launch shows the gated landing page only. Post-launch opens the full storefront.' },
    { id: 'set-promo', key: 'promoEndsAt', value: PROMO.freeUntil, label: 'Founding promotion ends' },
    { id: 'set-billing', key: 'billingStartsAt', value: PROMO.billingStarts, label: 'Paid billing begins' },
  ]);

  db.markSeeded();
  return true;
}

const SUBSCRIBERS = [
  ['amina.begum@example.com', 'Amina Begum', iso(2026, 5, 2)],
  ['abdul.rashid.k@example.com', 'Abdul Rashid K.', iso(2026, 5, 4)],
  ['layla.s@example.com', 'Layla S.', iso(2026, 5, 11)],
  ['h.tanveer@example.com', 'Hina Tanveer', iso(2026, 5, 19)],
  ['omar.faruq@example.com', 'Omar Faruq', iso(2026, 6, 1)],
  ['zainab.ali@example.com', 'Zainab Ali', iso(2026, 6, 6)],
  ['school.admin@nurulhuda.org', 'Nurul Huda Academy', iso(2026, 6, 12)],
  ['t.abdullah@example.com', 'Tariq Abdullah', iso(2026, 6, 18)],
  ['sarah.mahmud@example.com', 'Sarah Mahmud', iso(2026, 6, 25)],
  ['coop.leeds@example.com', 'Leeds Homeschool Co-op', iso(2026, 7, 2)],
  ['n.chaudhry@example.com', 'Nasreen Chaudhry', iso(2026, 7, 8)],
  ['imran.dawood@example.com', 'Imran Dawood', iso(2026, 7, 15)],
  ['aaliyah.k@example.com', 'Aaliyah Khan', iso(2026, 7, 21)],
  ['mustafa.b@example.com', 'Mustafa Bhatti', iso(2026, 7, 28)],
  ['ummu.salamah@example.com', 'Ummu Salamah', iso(2026, 8, 1)],
].map(([email, name, at], i) => ({ id: 'sb-' + (i + 1), email, name, createdAt: at, confirmed: i % 6 !== 0, source: 'landing' }));

const MESSAGES = [
  { id: 'm-1', vendorId: 'v-1', productId: 'p-main', fromUserId: 'u-c1', fromName: 'Aisha Rahman',
    kind: 'enquiry', subject: 'Google Slides version', status: 'open',
    body: 'Salaam — is the Google Slides version editable, or view-only? I would like to swap two of the passages for Seerah texts we already use.',
    createdAt: iso(2026, 7, 30) },
  { id: 'm-2', vendorId: 'v-1', productId: 'p-r1', fromUserId: 'u-c5', fromName: 'Fatima Bakr',
    kind: 'message', subject: 'Bundle for a co-op', status: 'open',
    body: 'Do you offer a licence for a homeschool co-op of about twelve families? Happy to pay for multiple seats.',
    createdAt: iso(2026, 8, 3) },
  { id: 'm-3', vendorId: 'v-2', productId: 'p-b1', fromUserId: 'u-c4', fromName: 'Wei Chen',
    kind: 'enquiry', subject: 'Print size', status: 'answered',
    body: 'Are the tracing strips sized for A4 as well as US Letter?', createdAt: iso(2026, 7, 22) },
  { id: 'm-4', vendorId: 'v-6', productId: null, fromUserId: 'u-c6', fromName: 'Idris Mahmood',
    kind: 'message', subject: 'Arabic letter cards request', status: 'open',
    body: 'Would you consider a version of the clip cards with the Arabic letters in isolated, initial, medial and final forms?',
    createdAt: iso(2026, 8, 5) },
  { id: 'm-5', vendorId: 'v-5', productId: 'p-b4', fromUserId: 'u-c2', fromName: 'Maryam Patterson',
    kind: 'enquiry', subject: 'Answer key missing', status: 'answered',
    body: 'The download seems to be missing the answer key that is mentioned on page 2. Could you check?',
    createdAt: iso(2026, 6, 30) },
];

const CONTENT_PAGES = [
  { id: 'pg-about', slug: 'about', title: 'About Us', status: 'published', updatedAt: iso(2026, 7, 1),
    body: 'Uloominate is a digital marketplace supplying Islamic educational resources to teachers, parents and homeschoolers. It follows the model of a general teaching marketplace, narrowed deliberately to a single category: faith-aligned educational material for the Muslim community.\n\nIslamic resources exist on general marketplaces, but they are difficult to locate because buyers must filter through a large volume of secular material. There is no dedicated, trusted marketplace where Muslim educators can reliably find faith-aligned resources, and no dedicated channel through which Muslim creators can reach that audience.\n\nUloominate addresses both sides of that gap with a single-category marketplace governed by an explicit content standard.' },
  { id: 'pg-privacy', slug: 'privacy', title: 'Privacy Policy', status: 'published', updatedAt: iso(2026, 7, 1),
    body: 'This policy explains what we collect, why we collect it, and the choices you have.\n\nWe collect the account details you give us at registration, the resources you publish or purchase, and basic usage data needed to run the platform. Payment details are handled by our payment provider and are not stored on our servers.\n\nVendor resource files are held in a client-owned external storage workspace and served only to verified purchasers through non-guessable, expiring links.' },
  { id: 'pg-terms', slug: 'terms', title: 'Terms & Conditions', status: 'published', updatedAt: iso(2026, 7, 1),
    body: 'These terms govern use of the Uloominate marketplace by vendors and by customers.\n\nVendors retain ownership of their original work. Every product requires administrative approval before it becomes publicly visible, and approval applies to new submissions as well as to subsequent edits of previously approved products.\n\nCommission is calculated per plan tier and applied automatically at the point of sale. Payouts are issued monthly by PayPal or bank deposit. Purchasers may re-download any resource they have bought, without limit.' },
  { id: 'pg-contact', slug: 'contact', title: 'Contact Us', status: 'published', updatedAt: iso(2026, 7, 1),
    body: 'Questions about vendor plans, an order, or a resource you have downloaded? Send us a message and we will reply within two working days.' },
];

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
