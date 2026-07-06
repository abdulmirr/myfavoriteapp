import type { MediaType } from "./types";

/**
 * The onboarding taste wall: well-known covers already shipped for the landing
 * page (public/landing/covers), tappable as instant first favorites. Kept as
 * its own list — Landing.tsx stays untouched. At commit time each pick is
 * enriched through /api/search for a canonical id + hosted artwork; the local
 * file is only the wall thumbnail and the fallback image.
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
};

const pick = (
  media_type: MediaType,
  file: string,
  title: string,
  creator: string
): StarterPick => ({ media_type, title, creator, src: `/landing/covers/${file}` });

export const STARTER_SECTIONS: { label: string; picks: StarterPick[] }[] = [
  {
    label: "Music",
    picks: [
      pick("music", "album-blonde.jpg", "Blonde", "Frank Ocean"),
      pick("music", "album-in-rainbows.jpg", "In Rainbows", "Radiohead"),
      pick("music", "album-yeezus.jpg", "Yeezus", "Kanye West"),
      pick("music", "album-currents.jpg", "Currents", "Tame Impala"),
      pick("music", "album-igor.jpg", "IGOR", "Tyler, the Creator"),
      pick("music", "album-wish-you-were-here.jpg", "Wish You Were Here", "Pink Floyd"),
      pick("music", "album-channel-orange.jpg", "channel ORANGE", "Frank Ocean"),
      pick("music", "album-the-life-of-pablo.jpg", "The Life of Pablo", "Kanye West"),
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
      pick("book", "book-east-of-eden.jpg", "East of Eden", "John Steinbeck"),
      pick("book", "book-sapiens.jpg", "Sapiens", "Yuval Noah Harari"),
      pick("book", "book-blood-meridian.jpg", "Blood Meridian", "Cormac McCarthy"),
      pick("book", "book-crime-and-punishment.jpg", "Crime and Punishment", "Fyodor Dostoevsky"),
      pick("book", "book-mans-search-for-meaning.jpg", "Man's Search for Meaning", "Viktor Frankl"),
      pick("book", "book-brave-new-world.jpg", "Brave New World", "Aldous Huxley"),
    ],
  },
  {
    label: "Film & TV",
    picks: [
      pick("movie", "film-interstellar.jpg", "Interstellar", "Christopher Nolan"),
      pick("movie", "film-whiplash.jpg", "Whiplash", "Damien Chazelle"),
      pick("movie", "film-pulp-fiction.jpg", "Pulp Fiction", "Quentin Tarantino"),
      pick("movie", "film-parasite.jpg", "Parasite", "Bong Joon-ho"),
      pick("movie", "film-her.jpg", "Her", "Spike Jonze"),
      pick("movie", "film-the-dark-knight.jpg", "The Dark Knight", "Christopher Nolan"),
      pick("movie", "film-2001-a-space-odyssey.jpg", "2001: A Space Odyssey", "Stanley Kubrick"),
      pick("movie", "film-marty-supreme.jpg", "Marty Supreme", "Josh Safdie"),
      pick("movie", "film-oppenheimer.jpg", "Oppenheimer", "Christopher Nolan"),
      pick("movie", "film-the-social-network.jpg", "The Social Network", "David Fincher"),
      pick("movie", "film-city-of-god.jpg", "City of God", "Fernando Meirelles"),
      pick("movie", "film-uncut-gems.jpg", "Uncut Gems", "Safdie brothers"),
      pick("movie", "film-inception.jpg", "Inception", "Christopher Nolan"),
    ],
  },
  {
    label: "Podcasts",
    picks: [
      pick("podcast", "podcast-founders.jpg", "Founders", "David Senra"),
      pick("podcast", "podcast-lex-fridman.jpg", "Lex Fridman Podcast", "Lex Fridman"),
      pick("podcast", "podcast-acquired.jpg", "Acquired", "Ben Gilbert and David Rosenthal"),
      pick("podcast", "podcast-httotw.jpg", "How to Take Over the World", "Ben Wilson"),
    ],
  },
];
