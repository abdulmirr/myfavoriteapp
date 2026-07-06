import type { MediaType } from "./types";

/**
 * The onboarding taste wall: well-known covers shipped locally
 * (public/landing/covers), tappable as instant first favorites. Kept as its
 * own list — Landing.tsx stays untouched. After commit each pick gets a
 * background canonical pass through /api/search for a real id + hosted
 * artwork; the local file is the wall thumbnail and the fallback image.
 * Blog picks skip that pass (nothing canonical to find) and carry their own
 * view_url instead.
 *
 * Section order mirrors Home's For You page (Music → Books → Film & TV → …)
 * so the first page a new user assembles reads like the one they'll land on.
 */

export type StarterPick = {
  media_type: MediaType;
  title: string;
  creator: string;
  /** wall thumbnail + fallback artwork */
  src: string;
  /** preset link for picks the search engine can't enrich (blogs) */
  view_url?: string;
};

const pick = (
  media_type: MediaType,
  file: string,
  title: string,
  creator: string,
  view_url?: string
): StarterPick => ({
  media_type,
  title,
  creator,
  src: `/landing/covers/${file}`,
  ...(view_url ? { view_url } : {}),
});

export const STARTER_SECTIONS: { label: string; picks: StarterPick[] }[] = [
  {
    label: "Music",
    picks: [
      pick("music", "album-blonde.jpg", "Blonde", "Frank Ocean"),
      pick("music", "album-in-rainbows.jpg", "In Rainbows", "Radiohead"),
      pick("music", "album-abbey-road.jpg", "Abbey Road", "The Beatles"),
      pick("music", "album-to-pimp-a-butterfly.jpg", "To Pimp a Butterfly", "Kendrick Lamar"),
      pick("music", "album-currents.jpg", "Currents", "Tame Impala"),
      pick("music", "album-thriller.jpg", "Thriller", "Michael Jackson"),
      pick("music", "album-igor.jpg", "IGOR", "Tyler, the Creator"),
      pick("music", "album-rumours.jpg", "Rumours", "Fleetwood Mac"),
      pick("music", "album-yeezus.jpg", "Yeezus", "Kanye West"),
      pick("music", "album-folklore.jpg", "folklore", "Taylor Swift"),
      pick("music", "album-nevermind.jpg", "Nevermind", "Nirvana"),
      pick("music", "album-take-care.jpg", "Take Care", "Drake"),
      pick("music", "album-wish-you-were-here.jpg", "Wish You Were Here", "Pink Floyd"),
      pick("music", "album-nfr.jpg", "Norman Fucking Rockwell!", "Lana Del Rey"),
      pick("music", "album-illmatic.jpg", "Illmatic", "Nas"),
      pick("music", "album-channel-orange.jpg", "channel ORANGE", "Frank Ocean"),
      pick("music", "album-am.jpg", "AM", "Arctic Monkeys"),
      pick("music", "album-miseducation.jpg", "The Miseducation of Lauryn Hill", "Lauryn Hill"),
      pick("music", "album-the-life-of-pablo.jpg", "The Life of Pablo", "Kanye West"),
      pick("music", "album-after-hours.jpg", "After Hours", "The Weeknd"),
      pick("music", "album-random-access-memories.jpg", "Random Access Memories", "Daft Punk"),
      pick("music", "album-the-new-abnormal.jpg", "The New Abnormal", "The Strokes"),
      pick("music", "album-californication.jpg", "Californication", "Red Hot Chili Peppers"),
      pick("music", "album-chromakopia.jpg", "CHROMAKOPIA", "Tyler, the Creator"),
    ],
  },
  {
    label: "Books",
    picks: [
      pick("book", "book-1984.jpg", "1984", "George Orwell"),
      pick("book", "book-the-secret-history.jpg", "The Secret History", "Donna Tartt"),
      pick("book", "book-meditations.jpg", "Meditations", "Marcus Aurelius"),
      pick("book", "book-the-great-gatsby.jpg", "The Great Gatsby", "F. Scott Fitzgerald"),
      pick("book", "book-dune.jpg", "Dune", "Frank Herbert"),
      pick("book", "book-east-of-eden.jpg", "East of Eden", "John Steinbeck"),
      pick("book", "book-project-hail-mary.jpg", "Project Hail Mary", "Andy Weir"),
      pick("book", "book-to-kill-a-mockingbird.jpg", "To Kill a Mockingbird", "Harper Lee"),
      pick("book", "book-sapiens.jpg", "Sapiens", "Yuval Noah Harari"),
      pick("book", "book-a-little-life.jpg", "A Little Life", "Hanya Yanagihara"),
      pick("book", "book-blood-meridian.jpg", "Blood Meridian", "Cormac McCarthy"),
      pick("book", "book-atomic-habits.jpg", "Atomic Habits", "James Clear"),
      pick("book", "book-the-song-of-achilles.jpg", "The Song of Achilles", "Madeline Miller"),
      pick("book", "book-crime-and-punishment.jpg", "Crime and Punishment", "Fyodor Dostoevsky"),
      pick("book", "book-shoe-dog.jpg", "Shoe Dog", "Phil Knight"),
      pick("book", "book-norwegian-wood.jpg", "Norwegian Wood", "Haruki Murakami"),
      pick("book", "book-mans-search-for-meaning.jpg", "Man's Search for Meaning", "Viktor Frankl"),
      pick("book", "book-the-alchemist.jpg", "The Alchemist", "Paulo Coelho"),
      pick(
        "book",
        "book-tomorrow-x3.jpg",
        "Tomorrow, and Tomorrow, and Tomorrow",
        "Gabrielle Zevin"
      ),
      pick("book", "book-the-catcher-in-the-rye.jpg", "The Catcher in the Rye", "J.D. Salinger"),
      pick("book", "book-zero-to-one.jpg", "Zero to One", "Peter Thiel"),
      pick(
        "book",
        "book-the-count-of-monte-cristo.jpg",
        "The Count of Monte Cristo",
        "Alexandre Dumas"
      ),
      pick("book", "book-red-rising.jpg", "Red Rising", "Pierce Brown"),
      pick("book", "book-brave-new-world.jpg", "Brave New World", "Aldous Huxley"),
    ],
  },
  {
    label: "Film & TV",
    picks: [
      pick("movie", "film-interstellar.jpg", "Interstellar", "Christopher Nolan"),
      pick("movie", "film-whiplash.jpg", "Whiplash", "Damien Chazelle"),
      pick("tv", "tv-breaking-bad.jpg", "Breaking Bad", "Vince Gilligan"),
      pick("movie", "film-pulp-fiction.jpg", "Pulp Fiction", "Quentin Tarantino"),
      pick("movie", "film-parasite.jpg", "Parasite", "Bong Joon-ho"),
      pick("tv", "tv-severance.jpg", "Severance", "Dan Erickson"),
      pick("movie", "film-her.jpg", "Her", "Spike Jonze"),
      pick("movie", "film-the-godfather.jpg", "The Godfather", "Francis Ford Coppola"),
      pick("movie", "film-the-dark-knight.jpg", "The Dark Knight", "Christopher Nolan"),
      pick("tv", "tv-the-sopranos.jpg", "The Sopranos", "David Chase"),
      pick("movie", "film-spirited-away.jpg", "Spirited Away", "Hayao Miyazaki"),
      pick("movie", "film-2001-a-space-odyssey.jpg", "2001: A Space Odyssey", "Stanley Kubrick"),
      pick("movie", "film-marty-supreme.jpg", "Marty Supreme", "Josh Safdie"),
      pick("tv", "tv-succession.jpg", "Succession", "Jesse Armstrong"),
      pick("movie", "film-fight-club.jpg", "Fight Club", "David Fincher"),
      pick("movie", "film-oppenheimer.jpg", "Oppenheimer", "Christopher Nolan"),
      pick("movie", "film-the-social-network.jpg", "The Social Network", "David Fincher"),
      pick("tv", "tv-the-office.jpg", "The Office", "Greg Daniels"),
      pick("movie", "film-city-of-god.jpg", "City of God", "Fernando Meirelles"),
      pick(
        "movie",
        "film-eeaao.jpg",
        "Everything Everywhere All at Once",
        "Daniels"
      ),
      pick("movie", "film-goodfellas.jpg", "Goodfellas", "Martin Scorsese"),
      pick("movie", "film-uncut-gems.jpg", "Uncut Gems", "Safdie brothers"),
      pick("movie", "film-la-la-land.jpg", "La La Land", "Damien Chazelle"),
      pick("movie", "film-inception.jpg", "Inception", "Christopher Nolan"),
    ],
  },
  {
    label: "Podcasts",
    picks: [
      pick("podcast", "podcast-founders.jpg", "Founders", "David Senra"),
      pick("podcast", "podcast-lex-fridman.jpg", "Lex Fridman Podcast", "Lex Fridman"),
      pick("podcast", "podcast-acquired.jpg", "Acquired", "Ben Gilbert and David Rosenthal"),
      pick("podcast", "podcast-huberman.jpg", "Huberman Lab", "Andrew Huberman"),
      pick("podcast", "podcast-httotw.jpg", "How to Take Over the World", "Ben Wilson"),
      pick("podcast", "podcast-hardcore-history.jpg", "Hardcore History", "Dan Carlin"),
    ],
  },
  {
    label: "Blogs",
    picks: [
      pick(
        "article",
        "blog-paul-graham.svg",
        "Paul Graham's Essays",
        "Paul Graham",
        "https://paulgraham.com/articles.html"
      ),
      pick(
        "article",
        "blog-stratechery.svg",
        "Stratechery",
        "Ben Thompson",
        "https://stratechery.com"
      ),
      pick(
        "article",
        "blog-wait-but-why.svg",
        "Wait But Why",
        "Tim Urban",
        "https://waitbutwhy.com"
      ),
      pick(
        "article",
        "blog-pmarca.svg",
        "pmarca",
        "Marc Andreessen",
        "https://pmarca.substack.com"
      ),
      pick(
        "article",
        "blog-farnam-street.svg",
        "Farnam Street",
        "Shane Parrish",
        "https://fs.blog"
      ),
      pick(
        "article",
        "blog-marginalian.svg",
        "The Marginalian",
        "Maria Popova",
        "https://www.themarginalian.org"
      ),
    ],
  },
];
