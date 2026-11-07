// All characters, stories and items here are original to Bookmark Club.

const BUDDIES = [
  { id: "pip",   name: "Pip",   color: "#ff6b6b", face: "😄", bio: "Loves adventure stories and never loses a page." },
  { id: "moss",  name: "Moss",  color: "#4ecb71", face: "🤓", bio: "A fact-finder who reads about bugs, rocks and rockets." },
  { id: "juno",  name: "Juno",  color: "#5aa9ff", face: "😎", bio: "Reads mysteries under a flashlight. Very cool." },
  { id: "tully", name: "Tully", color: "#ffb43d", face: "🥳", bio: "Thinks every book deserves a party at the end." },
  { id: "violet",name: "Violet",color: "#b77cff", face: "😊", bio: "Collects poems and writes her own on sticky notes." },
];

const LEVELS = [
  { id: 1, name: "Level 1 · Sprout",   color: "#4ecb71" },
  { id: 2, name: "Level 2 · Sapling",  color: "#5aa9ff" },
  { id: 3, name: "Level 3 · Big Oak",  color: "#b77cff" },
];

const STORIES = [
  {
    id: "s1", level: 1, title: "The Lost Red Kite", icon: "🪁",
    text: `Mia had a red kite. It had a long tail with blue bows. One windy day, Mia ran to the hill. The wind pulled the kite up, up, up! Then the string slipped from her hand. The kite flew over the trees. Mia ran after it. She found it stuck in an old apple tree. Her grandpa came with a ladder. He climbed up and got the kite. "Hold on tight this time," he said with a smile. Mia held the string with both hands. The red kite danced in the sky all afternoon.`,
    questions: [
      { q: "What color was Mia's kite?", a: ["Blue", "Red", "Green", "Yellow"], c: 1 },
      { q: "Where did the kite get stuck?", a: ["On a roof", "In a pond", "In an apple tree", "On a fence"], c: 2 },
      { q: "Who helped Mia get the kite?", a: ["Her grandpa", "Her teacher", "Her dog", "Her sister"], c: 0 },
    ],
  },
  {
    id: "s2", level: 1, title: "Benny Bakes Bread", icon: "🍞",
    text: `Benny the bear wanted to bake bread. He got flour, water, salt and yeast. He mixed them in a big bowl. Then he squished the dough with his paws. Squish, squash, squish! Benny put the dough in a warm spot. He waited and waited. The dough grew bigger and puffy. Next, Benny put it in the oven. Soon the whole cave smelled yummy. Benny shared the warm bread with his friend Rabbit. "This is the best bread ever!" said Rabbit.`,
    questions: [
      { q: "What did Benny want to make?", a: ["Cookies", "Soup", "Bread", "Pie"], c: 2 },
      { q: "What happened when the dough sat in a warm spot?", a: ["It got smaller", "It grew bigger", "It turned blue", "It froze"], c: 1 },
      { q: "Who did Benny share with?", a: ["Rabbit", "Fox", "Owl", "Nobody"], c: 0 },
    ],
  },
  {
    id: "s3", level: 2, title: "Night of the Fireflies", icon: "✨",
    text: `Every summer, the field behind Leo's house lit up with fireflies. Leo liked to sit on the porch steps and count them. One night he counted forty-two before he lost track. His older sister, Ana, explained that fireflies glow to talk to each other. Each kind of firefly blinks in its own pattern, like a secret code. Leo grabbed a flashlight and tried blinking back: short, short, long. To his surprise, a firefly near the fence blinked twice and floated closer. Leo knew it was probably just a coincidence, but he decided to keep their conversation a secret anyway.`,
    questions: [
      { q: "Why do fireflies glow, according to Ana?", a: ["To stay warm", "To talk to each other", "To scare birds", "To find food"], c: 1 },
      { q: "What did Leo use to blink back?", a: ["A candle", "A phone", "A flashlight", "A lamp"], c: 2 },
      { q: "What does 'coincidence' most likely mean here?", a: ["Something that happens by chance", "A type of bug", "A loud noise", "A secret code"], c: 0 },
    ],
  },
  {
    id: "s4", level: 2, title: "How Do Bees Make Honey?", icon: "🐝",
    text: `Honeybees work as a team to make honey. First, worker bees fly from flower to flower to collect a sweet liquid called nectar. They store the nectar in a special part of their body called a honey stomach. Back at the hive, they pass the nectar to other bees, who chew it and add enzymes. Then the bees spread the nectar into wax cells and fan it with their wings. The fanning dries out the water, turning the nectar into thick, sticky honey. Finally, the bees seal each cell with a wax cap. One bee makes only about one-twelfth of a teaspoon of honey in its whole life!`,
    questions: [
      { q: "What do bees collect from flowers?", a: ["Pollen only", "Nectar", "Water", "Seeds"], c: 1 },
      { q: "Why do bees fan the nectar with their wings?", a: ["To dry out the water", "To keep it cold", "To scare other bugs", "To make music"], c: 0 },
      { q: "What is the main idea of this passage?", a: ["Bees can sting", "Bees live in trees", "Bees work together to make honey", "Honey is expensive"], c: 2 },
    ],
  },
  {
    id: "s5", level: 3, title: "The Clockmaker's Apprentice", icon: "🕰️",
    text: `In a narrow shop squeezed between a bakery and a bookbinder, old Mr. Halloway repaired clocks of every size. His apprentice, a girl named Priya, swept the floors and sorted tiny gears into jars. For months she only watched. Then one rainy morning, the town's tower clock stopped at exactly 9:14. Mr. Halloway was sick in bed, so the mayor came knocking for Priya. Her hands trembled as she climbed the tower's spiral stairs. Inside the clock, she found the problem: a single bent tooth on the largest gear. Remembering everything she had observed, Priya carefully straightened it with pliers. When the great bell finally rang ten o'clock, the whole town cheered — and Priya realized that all that watching had been learning after all.`,
    questions: [
      { q: "Why did the mayor ask Priya for help?", a: ["She was the mayor's daughter", "Mr. Halloway was sick", "She broke the clock", "She lived in the tower"], c: 1 },
      { q: "What was wrong with the tower clock?", a: ["It needed batteries", "The bell was cracked", "A gear had a bent tooth", "It was too wet"], c: 2 },
      { q: "What lesson did Priya learn?", a: ["Watching carefully is a way of learning", "Clocks are boring", "Never climb stairs", "Rain breaks clocks"], c: 0 },
    ],
  },
  {
    id: "s6", level: 3, title: "Volcanoes: Mountains of Fire", icon: "🌋",
    text: `Deep beneath Earth's surface, temperatures are so high that rock melts into a thick liquid called magma. Because magma is lighter than the solid rock around it, it slowly rises toward the surface. When pressure builds up, the magma can burst through cracks in Earth's crust. Once it reaches the surface, it is called lava. Over many eruptions, layers of cooled lava and ash pile up to form a cone-shaped mountain: a volcano. Some volcanoes erupt explosively, blasting ash miles into the sky, while others ooze lava gently like syrup. Scientists called volcanologists study these mountains to help warn people before dangerous eruptions happen.`,
    questions: [
      { q: "What is magma called once it reaches the surface?", a: ["Ash", "Lava", "Crust", "Steam"], c: 1 },
      { q: "Why does magma rise?", a: ["It is lighter than solid rock", "Wind pulls it up", "It is frozen", "Volcanologists push it"], c: 0 },
      { q: "What do volcanologists do?", a: ["Build volcanoes", "Cook with lava", "Study volcanoes to warn people", "Plant trees"], c: 2 },
    ],
  },
];

// slot: where it goes in the clubhouse. "wall" items hang up top, "floor" items sit at the bottom.
const CATALOG = [
  { id: "c1",  name: "Comfy Beanbag",    icon: "🛋️", price: 30, cat: "Furniture", slot: "floor" },
  { id: "c2",  name: "Reading Lamp",     icon: "🪔", price: 20, cat: "Furniture", slot: "floor" },
  { id: "c3",  name: "Tall Bookshelf",   icon: "📚", price: 45, cat: "Furniture", slot: "floor" },
  { id: "c4",  name: "Potted Plant",     icon: "🪴", price: 15, cat: "Furniture", slot: "floor" },
  { id: "c5",  name: "Fish Tank",        icon: "🐠", price: 60, cat: "Furniture", slot: "floor" },
  { id: "c6",  name: "Toy Robot",        icon: "🤖", price: 35, cat: "Toys",      slot: "floor" },
  { id: "c7",  name: "Skateboard",       icon: "🛹", price: 40, cat: "Toys",      slot: "floor" },
  { id: "c8",  name: "Soccer Ball",      icon: "⚽", price: 15, cat: "Toys",      slot: "floor" },
  { id: "c9",  name: "Teddy Bear",       icon: "🧸", price: 25, cat: "Toys",      slot: "floor" },
  { id: "c10", name: "Game Console",     icon: "🎮", price: 80, cat: "Toys",      slot: "floor" },
  { id: "c11", name: "Rocket Poster",    icon: "🚀", price: 20, cat: "Wall",      slot: "wall" },
  { id: "c12", name: "Rainbow",          icon: "🌈", price: 25, cat: "Wall",      slot: "wall" },
  { id: "c13", name: "Wall Clock",       icon: "🕰️", price: 20, cat: "Wall",      slot: "wall" },
  { id: "c14", name: "Gold Trophy",      icon: "🏆", price: 100, cat: "Wall",     slot: "wall" },
  { id: "c15", name: "Disco Ball",       icon: "🪩", price: 70, cat: "Wall",      slot: "wall" },
  { id: "c16", name: "Planet Mobile",    icon: "🪐", price: 50, cat: "Wall",      slot: "wall" },
  { id: "w1",  name: "Sky Blue Walls",   icon: "🟦", price: 30, cat: "Wallpaper", slot: "theme", theme: "linear-gradient(#bfe3ff,#e8f5ff)" },
  { id: "w2",  name: "Bubblegum Walls",  icon: "🟪", price: 30, cat: "Wallpaper", slot: "theme", theme: "linear-gradient(#ffc8ec,#fff0fa)" },
  { id: "w3",  name: "Jungle Walls",     icon: "🟩", price: 40, cat: "Wallpaper", slot: "theme", theme: "linear-gradient(#a8e6a1,#e6ffe2)" },
  { id: "w4",  name: "Outer Space",      icon: "⬛", price: 75, cat: "Wallpaper", slot: "theme", theme: "radial-gradient(circle at 30% 20%,#3b2d7a,#0d0b26)" },
];

const SCRAMBLE_WORDS = [
  { w: "BOOK",    hint: "You read it!" },
  { w: "STORY",   hint: "A tale with a beginning, middle and end" },
  { w: "LIBRARY", hint: "A building full of books to borrow" },
  { w: "AUTHOR",  hint: "The person who writes a book" },
  { w: "CHAPTER", hint: "A section of a book" },
  { w: "POEM",    hint: "Writing that often rhymes" },
  { w: "TITLE",   hint: "The name of a book" },
  { w: "PAGE",    hint: "One sheet of a book" },
  { w: "DRAGON",  hint: "A fire-breathing creature in fairy tales" },
  { w: "MYSTERY", hint: "A story with a puzzle to solve" },
];

const MATCH_PAIRS = [
  ["happy", "glad"], ["big", "huge"], ["fast", "quick"], ["small", "tiny"],
  ["angry", "mad"], ["begin", "start"], ["shout", "yell"], ["smart", "clever"],
];
