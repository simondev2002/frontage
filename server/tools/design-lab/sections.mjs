// The sections to design, with the content contract each one must honour. Sample
// content is one real-feeling business so candidates are comparable. Photo URLs are
// sample photos that exist (picsum ids picked for a bakery/café feel).
export const PHOTOS = {
  hero: "https://picsum.photos/id/835/1400/1000",     // cookies on a dark plate
  latte: "https://picsum.photos/id/431/1200/900",     // latte on wood
  produce: "https://picsum.photos/id/292/1200/900",   // vegetables on a table
  bowl: "https://picsum.photos/id/493/1200/900",      // oatmeal with strawberries
  berries: "https://picsum.photos/id/1080/1200/900",  // strawberries
  hands: "https://picsum.photos/id/674/1200/900",     // hands holding grapes
};

export const BUSINESS = {
  name: "Oak & Ember",
  tagline: "Wood-fired sourdough, baked before Larnaca wakes up.",
  city: "Larnaca",
  phone: "+357 24 123 456",
  email: "hello@oakandember.cy",
  address: "14 Zinonos Kitieos, Larnaca 6023",
};

// Each section: what it is for, the fields the renderer can supply, sample values,
// and two "directions" that push the models toward different compositions.
export const SECTIONS = [
  {
    id: "hero",
    heading: "h1",
    purpose: "The first screen. Must sell the business in three seconds: name, what it is, where, one primary action, one secondary action, one photo.",
    fields: "eyebrow (short label), headline (5 to 9 words), subheadline (1 to 2 sentences), primary button label + href, secondary button label + href, one photo with alt",
    sample: { eyebrow: "Larnaca · open from 6:30", headline: "Bread like your grandmother's, baked before dawn.", subheadline: "A small wood-fired bakery two streets from the harbour. Sourdough, cinnamon buns and cakes to order, from 6:30 every morning.", primary: "Order for pickup", secondary: "See the menu", photo: "hero" },
    directions: [
      "Editorial split: type on the left occupying more than half the width, photo on the right with a slight vertical offset and a thin rule or numeral detail. Calm and premium.",
      "Type-led stack: oversized headline across the full width, a small caption row (eyebrow, city, hours) above it, the photo below cropped wide and short like a magazine opener.",
    ],
  },
  {
    id: "about",
    heading: "h2",
    purpose: "Who is behind the business and why it exists. Builds trust.",
    fields: "eyebrow, heading, 2 to 3 paragraphs, optional photo with alt, optional 3 stats (value + label)",
    sample: { eyebrow: "Our story", heading: "Two ovens, one family, twenty years of flour.", paragraphs: ["Oak & Ember started in 2006 as a single wood-fired oven behind Maria's house. The bread sold out by nine every morning, so we built a second oven and opened the shop on Zinonos Kitieos.", "We still start every loaf the evening before, with a starter that is older than the bakery, and we still refuse to bake more than we can sell fresh."], stats: [["2006", "founded"], ["48h", "fermentation"], ["7", "kinds of bread"]], photo: "hands" },
    directions: [
      "Photo on the left with the text block starting lower than the photo, stats as a quiet row beneath the text with oversized numerals in the heading font.",
      "No photo: a wide pull-quote style opening line, then two narrow text columns, stats set as a thin-ruled table.",
    ],
  },
  {
    id: "services",
    heading: "h2",
    purpose: "What we offer, scannable. Owners sell 3 to 8 things.",
    fields: "heading, intro (optional), 3 to 6 items with title, description, optional price, optional photo",
    sample: { heading: "What comes out of the oven", intro: "Baked in small batches, so some days we sell out. Pre-order to be sure.", items: [["Country sourdough", "Our daily loaf. 48-hour fermentation, thick crust, open crumb.", "€4.50", "latte"], ["Cinnamon buns", "Soft, sticky, baked at 7:00 and again at 11:00.", "€2.80", "bowl"], ["Cakes to order", "Olive oil cake, carrot cake, birthday cakes. Three days' notice.", "from €28", "berries"], ["Wholesale bread", "For cafés and restaurants in Larnaca. Minimum ten loaves.", null, "produce"]] },
    directions: [
      "A numbered list with large index numerals, title, description and price on one row, thin rules between rows, one photo pinned on the right that stays while the list scrolls (position sticky).",
      "Asymmetric grid: the first item large with its photo, the rest smaller, prices set in the heading font.",
    ],
  },
  {
    id: "testimonials",
    heading: "h2",
    purpose: "Social proof. Two to four quotes from customers.",
    fields: "heading, 2 to 4 items with quote, author, optional role",
    sample: { heading: "From the people who queue at seven", items: [["The only sourdough in Larnaca that tastes like my yiayia's. We drive across town for it every Saturday.", "Eleni P.", "Aradippou"], ["We stock their rye at the café and customers ask where it's from every single day.", "Tom W.", "owner, Harbour Lane Coffee"], ["Ordered a birthday cake with two days' notice. It looked like a magazine and tasted better.", "Andreas K.", "Larnaca"]] },
    directions: [
      "One large featured quote with an oversized opening quotation mark in the accent colour, the others smaller beneath in two columns.",
      "A horizontal row of quote cards with no shadows: thin borders, generous padding, author line with a small rule.",
    ],
  },
  {
    id: "menu",
    heading: "h2",
    purpose: "A menu or price list with categories. Used by cafés, restaurants, salons.",
    fields: "heading, intro (optional), 2 to 4 categories each with name and 3 to 6 items (name, optional description, price)",
    sample: { heading: "Menu", categories: [["Bread", [["Country sourdough", "48-hour fermentation", "€4.50"], ["Seeded rye", "sunflower, flax, caraway", "€5.20"], ["Focaccia", "rosemary, sea salt", "€3.80"]]], ["Pastry", [["Cinnamon bun", null, "€2.80"], ["Almond croissant", "twice baked", "€3.20"], ["Olive oil cake (slice)", null, "€3.50"]]], ["Coffee", [["Espresso", null, "€2.00"], ["Flat white", null, "€3.00"], ["Filter", "single origin, changes weekly", "€3.20"]]]] },
    directions: [
      "Classic dotted-leader menu in two columns on desktop, one on mobile, category names as small caps eyebrows.",
      "Category tabs rendered as a simple stacked list with a heavy rule between categories and prices right-aligned in a tabular figure.",
    ],
  },
  {
    id: "gallery",
    heading: "h2",
    purpose: "Photos of the place, the work, the products.",
    fields: "heading (optional), 4 to 8 photos with alt",
    sample: { heading: "Inside the bakery", photos: ["hero", "latte", "produce", "bowl", "berries", "hands"] },
    directions: [
      "Editorial masonry with one photo spanning two rows, captions as small text under each photo.",
      "A horizontal filmstrip that scrolls sideways on mobile (scroll-snap) and shows all photos on desktop.",
    ],
  },
  {
    id: "faq",
    heading: "h2",
    purpose: "The questions customers actually ask.",
    fields: "heading, 3 to 8 items with question and answer",
    sample: { heading: "Questions we get every day", items: [["What time does the sourdough sell out?", "Usually by 10:00 on weekdays and 9:00 on Saturdays. Pre-order by phone the day before to be safe."], ["Do you do gluten-free?", "Not yet. Our ovens and flour make cross-contamination unavoidable, so we would rather be honest than sorry."], ["Can I pay by card?", "Yes, cards and contactless, and cash if you prefer."], ["Do you deliver?", "Within Larnaca for orders over €30, before 9:00. Email us the evening before."]] },
    directions: [
      "Native details/summary accordion with a plus sign that rotates, questions in the heading font, answers in muted text.",
      "Two-column open list on desktop, no accordion, question in bold body text with a thin rule above each.",
    ],
  },
  {
    id: "hours-contact",
    heading: "h2",
    purpose: "Opening hours, address, phone, email, plus a short contact form. The section owners care most about.",
    fields: "heading, intro (optional), hours (list of days + times), address, phone, email, a form with name, email, message, and a submit button",
    sample: { heading: "Come by, or write to us", intro: "We answer within the day. For cake orders give us three days.", hours: [["Monday to Friday", "6:30 to 15:00"], ["Saturday", "7:00 to 14:00"], ["Sunday", "Closed"]] },
    directions: [
      "Two columns: hours and address as a typographic table on the left, the form on the right with underlined inputs rather than boxes.",
      "Stacked: a big address line in the heading font, hours as a compact row, the form beneath with a full-width button.",
    ],
  },
  {
    id: "cta",
    heading: "h2",
    purpose: "A closing call to action before the footer.",
    fields: "heading, text (optional), one button label + href, optional photo",
    sample: { heading: "Order tonight, collect at dawn.", text: "Pre-orders close at 20:00. Pickup from 6:30 at Zinonos Kitieos.", button: "Order for pickup", photo: "hero" },
    directions: [
      "A band in the primary colour with the heading in the heading font and the button in the on-primary colour, a thin inset border as the only decoration.",
      "Photo background cropped to a short wide strip with a solid colour panel overlapping it that holds the text and button.",
    ],
  },
];
