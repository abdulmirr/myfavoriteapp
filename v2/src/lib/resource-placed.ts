import "server-only";
import type { Topic } from "./resource-topics";

/**
 * Where each of antislop's untagged picks belongs, placed by hand (2026-10-30).
 * Its curator tags only the picks in his collection (read live from its
 * `topics`); this places the other 525, and adds Writing to four of his
 * Creativity picks that are about writing. A pick in neither gets a guess
 * (lib/resources.ts). Keyed by antislop's id, grouped by first topic.
 */
export const PLACED: Record<string, Topic[]> = {
  // Mindset
  "8a09e29f-c450-4a61-b1af-d1867c50602b": ["Mindset"], // (Sub)Conscious (Re)Programming — Sean Pedersen
  "537974ea-09c9-4242-a2d7-477c7399e457": ["Mindset"], // 1 like = 1 way to live better. I'll try to keep a ratio of 50%… — Jakeup
  "9c2c775b-c660-4dec-b750-356e60aa8e79": ["Mindset"], // 100 Tips For A Better Life — Conor Barnes
  "1e5b7cbb-0298-449d-a2e7-1ae84595bc87": ["Mindset"], // 23 Markers of Psychological Health — Jonathan Shedler
  "c4b27439-d09c-4cdf-9511-6dac00801b77": ["Mindset"], // 90% of wellbeing is just sleeping well — roon
  "6d1df57c-e507-451e-a87a-2451d32a8757": ["Mindset"], // Agency > Intelligence I had this intuitively wrong for decades, I… — Andrej Karpathy
  "daf51698-d47e-47d6-82bf-d209cd803064": ["Mindset"], // All self-help boils down to "choose long-term over short-term." — Naval
  "abb49023-7dc4-43ee-9f50-7b22ce8b9a8e": ["Mindset"], // Always stick to what makes you weird, odd, strange, different.… — Robert Greene
  "c92c30e9-222e-46f1-9346-82cb137a6615": ["Mindset"], // As you become an adult, you realize that things around you weren't… — John Collison
  "9aafd642-be42-4e56-8be9-534094ea99fb": ["Mindset"], // Be maniacally focused on the future. There is nothing for you in the… — Ana Mostarac
  "96c97680-0970-4096-ab93-a6a3761e31b3": ["Mindset"], // Beginning is underrated — Seth Godin
  "0d473cd2-c4bc-45e0-998a-8d0d0be5601f": ["Mindset"], // Being wrong until you are right — Seth Godin
  "522c6368-b3cd-4af6-a392-19121e107f7a": ["Mindset"], // Big regret is saying to myself back in 2019, "I want to do this… — Eric Hu
  "32c587c9-c5bb-401b-a5dd-d2d568e90470": ["Mindset"], // Calmness is a superpower — Steph Ango
  "e0c7537c-3e9b-4dc5-80d1-0eb010bd7974": ["Mindset"], // Charles Bronson Advice To Tom Hardy After His Break Up — Tom Hardy
  "188ad972-608d-4e70-958f-321902c4644e": ["Mindset"], // Cherish mistakes — Aaron Swartz
  "ba40ec5b-989f-4a58-b43e-1149cb38ca50": ["Mindset"], // Choosing your fuel — Seth Godin
  "a8bd70ec-4d1a-475b-90ae-260062f9eeb7": ["Mindset"], // Confront reality — Aaron Swartz
  "03f314a3-64a7-4cad-9868-73c3d441fd13": ["Mindset"], // Courage is the only virtue you can't fake. — Nassim Nicholas Taleb
  "aae7a199-b6af-4534-af0c-fbf600236dcc": ["Mindset"], // Develop the ability to be disliked and free yourself from the prison… — Mark Manson
  "51a9161b-13e2-4d14-9f1e-5fcea397d38e": ["Mindset", "Learning"], // Developing a Growth Mindset with Carol Dweck — Carol Dweck
  "1ceb1ee7-4051-4b89-b5d6-9d1009f931de": ["Mindset"], // Disagreeableness has become the most important psychological trait.… — Jash Dholani
  "53db7c6d-d16b-4fce-aa59-4778c95f9c55": ["Mindset"], // Do literally anything — Aaron Francis
  "1237ffe8-5d08-4272-a7f9-a32f9599b074": ["Mindset"], // Do not waste time on things you cannot change or influence. Just… — Robert Greene
  "584ad7e9-ea77-4f58-a20f-af30350615fb": ["Mindset"], // Do Quests, Not Goals — David Cain
  "891310cc-ab0e-4668-b47b-4344247ca855": ["Mindset"], // Do you want to be liked, or do you want to win? — Marc Andreessen
  "f60abeb3-251e-4748-acc1-447f757d962b": ["Mindset"], // Doing hard stuff requires distress tolerance. Building distress… — Andrew Huberman
  "b1519c7e-4dd9-4fe5-ac52-edcc340299b4": ["Mindset"], // Don’t Worry, Everybody Else is Crazy Too — David Cain
  "9da99f9d-b834-4f52-977f-b2c0cec846ee": ["Mindset"], // Eventually you’ll realize that it’s better to be disliked for who… — Mark Manson
  "8faa2464-a96b-4c14-a497-9eb679605ee6": ["Mindset"], // Every action you take is a vote for the type of person you wish to… — James Clear
  "c49d5ba1-5651-450b-98a7-2689c4de58c4": ["Mindset"], // Everyone is better than you are — Seth Godin
  "03542535-79ce-4ffb-84f3-2f4074067c8e": ["Mindset"], // Execute by Default — Eliezer Yudkowsky
  "3751c261-04e2-4d43-b358-3878025c0be6": ["Mindset"], // FAILURE DOESNT EXIST — Kobe Bryant
  "40fa3f24-1ee2-4f35-bc9e-2029fe5a11e5": ["Mindset"], // Fear, failure and shame, oh my — Seth Godin
  "1d25055a-1d43-417a-afbd-52b8ee15a189": ["Mindset"], // Feeling mischievous so here's another thread. One like = one… — GeniesLoki
  "ab4bc4e1-924f-435b-a3e6-17308dab0363": ["Mindset"], // Focus on what you can control. Fuck the rest. — Mark Manson
  "726e0cbc-a85a-4600-b671-2414694311b6": ["Mindset"], // Go on more walks. Walk for no reason. Walk to solve a problem. Walk… — Dan Koe
  "8049f5d2-f091-47aa-92fa-fa9c089c2d5b": ["Mindset"], // Hit the gym. Avoid drama. Smell nice. Make money. Level up your… — James
  "e112e517-caaa-4896-a610-ecbb3014d0d1": ["Mindset"], // How to be Calm, Cool, and Collected while Trading — Rande Howell
  "cef157cb-4ed4-40c2-9ffc-c3fb26f3f5c1": ["Mindset"], // How to Become a Luckier Person Overnight — David Cain
  "8f59aabe-4eea-4ba2-9281-03c013bf3678": ["Mindset"], // How to Change — Venkatesh Rao
  "758646ea-9bef-43d6-abfb-50b246ddb149": ["Mindset"], // How to Easily Overcome Social Anxiety — Jordan Peterson
  "7a4f7911-b5df-4536-84bc-3d225a493d83": ["Mindset"], // How To Generate Certainty From Within and Win — Tony Robbins
  "1b5e1668-bd85-4b91-85ad-2efc734c3d50": ["Mindset"], // How to Stop Holding Yourself Back — Simon Sinek
  "752a261e-9843-4d9a-9f95-aefde04c88e7": ["Mindset"], // How to walk through walls — Henrik Karlsson
  "e4b12a03-6a12-47e5-9753-77f6e2a72e0b": ["Mindset"], // i hate how well asking myself "if i had 10x the agency i have what… — Nick
  "ad7feb6d-8e52-49aa-ae62-b63e0420fa9d": ["Mindset"], // I really don’t believe it’s possible for you to develop fully until… — BONESAW
  "45ddaecf-861c-4411-a65e-2c3c9f6d58d1": ["Mindset"], // I, and I alone, am responsible for everything I think and feel. — Naval
  "381eec96-d6cc-489b-86d4-b564df20631a": ["Mindset"], // I'm 37. Instead of regretting that I can't wake up age 18 again, I… — Fesshole
  "20e06dcf-481d-4135-afa7-6a69472b98c6": ["Mindset"], // I’ve never had a goal — Jason Fried
  "8be90f24-02da-457f-a8c9-760e88c77285": ["Mindset"], // If assholes don't find you arrogant, you are doing something wrong. — Nassim Nicholas Taleb
  "4bb1e805-8031-4566-ae1a-a05ccc5479b2": ["Mindset"], // If you even slightly entertain the thought of failure, you give your… — Dan Koe
  "4b594c31-9a60-4478-b6fd-15792c5e0ce2": ["Mindset"], // if you’re scared to start something because you might fail, here’s a… — Jack Butcher
  "a637dd82-d790-4b5d-8483-ea1c95d614b4": ["Mindset"], // If you're smart, ambitious and a deep thinker, why are you still… — James Lim
  "f50025aa-7bd1-48d9-9179-211c64144fdd": ["Mindset"], // Impostor syndrome: “I don't know what I'm doing. It's only a matter… — Adam Grant
  "22392ca7-5ac6-4217-a6f7-30f82080bfeb": ["Mindset"], // It takes 4-6 weeks of uncomfortable isolation to create a new vision… — Zach Pogrob
  "f3c6c5ad-b439-4f30-8921-5ea821746ccc": ["Mindset"], // It’s Gonna Take Years — Jude Fredman
  "e41ccc98-4659-4cf6-a4dd-ec5d6af102a9": ["Mindset"], // Jocko Willink "GOOD" (Official) — Jocko Podcast
  "16c11308-b5d3-4da1-8d4e-205ca0f3e1ed": ["Mindset"], // Just start. Start slow if you have to. Start small if you have to.… — James Clear
  "e5dffb30-9b3e-472f-bcb6-9083936fa2d8": ["Mindset"], // Keep Taking Shots — Stangest Loops
  "cdbafde6-bb71-405f-8778-e317daae497d": ["Mindset"], // Know Thyself — Boz
  "dd548743-9190-465a-b41e-a8db2f9fb38b": ["Mindset"], // Lean into the pain — Aaron Swartz
  "b6f1138f-690d-4b17-b702-3efbdf3b680c": ["Mindset"], // Live a Disciplined Life, Spontaneously — Naval
  "4961e1e6-c7b1-47cc-ba05-7a08d1043153": ["Mindset"], // Making change (in multiples) — Seth Godin
  "ccb3ff04-b77c-4b1b-9c0d-e7d34a678859": ["Mindset"], // Many of my brilliant friends are paralyzed by their intellects.… — David
  "b9b7842d-0dd3-43b9-9476-effb4f9a7024": ["Mindset"], // Mindset, Failure and Silicon Valley Founders — Carol Dweck
  "1bc17733-5976-4f46-9956-c3d236fcf776": ["Mindset"], // Most People Won't — Bryce Roberts
  "76e959dc-83af-4ec5-95b0-3cf8438778ca": ["Mindset"], // Navy Seal Commander explains why wake up at 4am — Casey Neistat
  "ea1c7941-db0c-45a1-a8da-6448b5c1b40b": ["Mindset"], // No big deal or the end of the world? — Jason Fried
  "2d8571b2-9518-4b97-9948-b281fb829554": ["Mindset"], // Nobody Cares What You Do — Christian Fournier
  "70ae3e88-365f-49d5-a4b0-6e6872d49cfe": ["Mindset"], // Notes to myself — Seth Godin
  "bb474d28-7092-4ac1-9703-f91b682e094f": ["Mindset"], // One day you'll realize the amount of potential you had, and how it… — neural nets.
  "3ae4f76b-cec8-4e71-ac72-a50ea6daf361": ["Mindset"], // One of my favorite lessons I’ve learnt from working with smart… — Brian Armstrong
  "f663e0b7-4de9-40b8-9100-c0ae979e3e2e": ["Mindset"], // one thing i have noticed about the best performers is delusional… — Kartikay
  "c40f4d05-c7a6-4aa5-8576-fcdc8bdf50d1": ["Mindset"], // Overestimate your future, underestimate your past. — Mark Manson
  "8eaa5700-caab-49c9-9a2f-d8bbbb57d451": ["Mindset"], // Psychokinetics — Manav B. Ponnekanti
  "cdd43e4a-33a6-448a-8672-53729007e48e": ["Mindset"], // Quieting the lizard brain — Seth Godin
  "7d5d930c-bd9c-4722-acb5-36519b01fa86": ["Mindset"], // Radical Responsibility — Boz
  "80ca684c-2ece-4110-b0f8-ed9c1180e35f": ["Mindset"], // Relentlessly Resourceful — Paul Graham
  "72969bb6-eb54-487c-8cfa-6db689ff1ff7": ["Mindset"], // Start caring less what people think of you. You will feel a… — Robert Greene
  "d962ace3-9c61-4dad-b6ab-ad07afaeca99": ["Mindset"], // Start now. Optimize later. Imperfect starts can always be improved.… — James Clear
  "5df89ef3-9c7d-4990-bc8e-7769e3dc4ab2": ["Mindset"], // Start small, start now — Seth Godin
  "84faabde-7aee-4064-bcf5-074c5984e58c": ["Mindset"], // Stephen Fry discusses self-pity — Stephen Fry
  "4bf12b46-0e75-442a-b38f-74370f39baee": ["Mindset"], // Steve Jobs on Failure — Steve Jobs
  "5549a175-9d61-4b32-850e-0ebf0c165f43": ["Mindset"], // Stopping the chattering mind — BSWA Retreats
  "d0ccc2cc-1df3-4dae-abda-faf99a62dcbe": ["Mindset"], // Suffer the pain of discipline now to avoid the pain of regret later. — Sahil Lavingia
  "ff1ec2a5-a450-4848-9205-8a56fce730ec": ["Mindset"], // Sunlight before screen light. Every day. Even if cloudy. Your mental… — Andrew Huberman
  "d316b08e-f27c-42ea-b638-d736516a8fd9": ["Mindset"], // Temperament is a skill — Seth Godin
  "5488d040-e578-4c09-8a84-6cb808cc997f": ["Mindset"], // The antidote to a bad day is a good workout. — James Clear
  "807016e6-c3bc-4628-b85e-36a5ed659c01": ["Mindset"], // The Art of Looking Like a Fool — David Cain
  "1bc827e0-6dfd-44f3-aaea-3b9428b626a7": ["Mindset"], // The best general advice on earth — James Somers
  "03dff1ca-80b7-42b0-af2e-adff19ef007e": ["Mindset"], // The key in life is to always be willing to walk away. — Robert Greene
  "e7e16fc5-cba0-4ecf-8925-ef33281b685e": ["Mindset"], // the limit on human progress isn't intelligence, it's courage — kache
  "e2111d94-7fd2-4fd0-962e-d919609e7a94": ["Mindset"], // The memories we rehearse are the ones we live with — Seth Godin
  "7b45148a-0727-48a4-a450-ab4542fef351": ["Mindset"], // The Mental Game — Bob Bowman
  "7b940ae8-642e-4a0d-854f-57576be88d6e": ["Mindset"], // The Moat of Low Status — Sasha Chapin
  "b650e862-5329-4f6d-91e2-4812ec6800b8": ["Mindset"], // The Modern-Day Mind-Killer — Keagan Stokoe
  "baf32291-a1df-4712-b40e-4aae2eb0073c": ["Mindset"], // the most impressive people i know just do stuff and they keep doing… — Anu Atluru
  "c12c2b25-3429-4754-b684-51cf4aa045c3": ["Mindset"], // the most powerful medicine we have for the soul is long walks. no… — Will Manidis
  "f80ea940-96d4-4f5f-8cfe-18b9b5a87d94": ["Mindset"], // The only thing we can truly control is where we place our attention… — Andrew Huberman
  "4200c414-8046-40a2-aa14-aede2633df19": ["Mindset"], // The Only Thing You Need to Get Good At — David Cain
  "29d3db57-57fe-40cb-ba1d-5ae75c21de24": ["Mindset"], // The Power of Beliefs — Tony Robbins
  "530842b6-5a47-40b5-b77c-434d00dda238": ["Mindset"], // The Secret of Self Image — Bob Proctor
  "2657bb30-5c41-4f2d-a6e2-19f464759e01": ["Mindset"], // the weird shall inherit the earth — David
  "871dfbda-3c5c-4548-8367-8143df5c44c8": ["Mindset"], // Things You're Allowed To Do — Milan Cvitkovic
  "05258dc1-4736-44b9-a596-e5de8542c0ba": ["Mindset"], // thinking about how in life, like in chess, you don’t actually need… — carmen
  "5666cd08-e5ed-44d6-859b-2ac1e82d28a7": ["Mindset"], // Three simple and difficult steps — Seth Godin
  "1a34d242-f382-441e-be14-b0f37eabf8af": ["Mindset"], // Trigger Warning: Reality Hurts — Mark Manson
  "5df747d3-72d3-4550-bfed-79354da58fb5": ["Mindset"], // Why Being Delusional is a Superpower — Veritasium
  "765920b8-dbe6-4900-971b-14841baa4e48": ["Mindset"], // You Are How You Act — Boz
  "4689b161-05ed-4ac3-bee7-2fca4696c5a5": ["Mindset"], // You are the author of your own life, and it’s never too late to… — Tim Ferriss
  "9f77b387-d3bc-47f2-ac2a-ea77c5db0259": ["Mindset"], // you can waste your entire life overthinking it: the window will slam… — Will Manidis
  "ae34957a-05ea-46b2-ba96-c2c32a6b059b": ["Mindset"], // you cannot hate yourself into becoming someone you love — Janelle
  "87e1f961-483a-4fa3-beed-ea1973808437": ["Mindset"], // You Don't Need More How-To Advice — You Need a Beautiful and Painful… — Tim Ferriss
  "c63aec80-0e01-45ff-be82-66727c6ee742": ["Mindset"], // You Messed Up…Now what? — Dry Creek Wrangler School
  "a1bb093d-5b4b-44d8-837f-e98dc67d03e7": ["Mindset"], // You Must Be The Master of Your Own Kingdom — Guy Ritchie
  "97021d35-f887-4bad-9683-00732bd3af30": ["Mindset"], // Your 1st blog post will be bad, but your 1000th will be great. Your… — James Clear

  // Worldview
  "696f285d-3c51-4ca7-9493-879abaef818a": ["Worldview"], // 40 questions to ask yourself every decade — Steph Ango
  "f017ab72-9c4e-402e-a427-968b5b52e5a8": ["Worldview"], // 40 Thoughts On Turning 40 — Paul Millerd
  "3903c1ac-b069-497e-96a5-95866b667bcf": ["Worldview"], // 7 Strange Questions That Help You Find Your Life Purpose — Mark Manson
  "a4ba54bb-f2c2-4a1c-9624-59942f4927ef": ["Worldview"], // A Few Rules — Morgan Housel
  "290940e5-b22d-4283-ac83-20a1d783644a": ["Worldview"], // A fit body, a calm mind, a house full of love. These things cannot… — Naval
  "bc6e9916-a7a8-4eed-9461-df5e24e3c91c": ["Worldview"], // Actions, not words, reveal our real values — Derek Sivers
  "ff48e4f1-01be-476d-8641-b7cad7eee1ab": ["Worldview"], // Amazon founder and CEO Jeff Bezos delivers graduation speech at… — Jeff Bezos
  "282a4949-98c9-4a78-a277-1645e161f642": ["Worldview"], // An old mans advice. — Bernard Albertson
  "62232998-34de-4433-95d6-ac30db6e38d1": ["Worldview"], // Anti-Identity — Venkatesh Rao
  "1e7c75ce-9b91-46a3-86e7-56b869470900": ["Worldview"], // Are you just living day to day? — 4yvn
  "916eedbe-4f9c-4e77-aa2a-97240bb209b4": ["Worldview"], // basically joseph campbell taught me to ritualize almost everything i… — Ashwin Sharma
  "7f29ae35-f6d7-4751-9a05-19fb956ec797": ["Worldview"], // Cardigan's Commencement Address by Chief Justice John G. Roberts, Jr. — John G. Roberts
  "389480bb-d681-4656-bf50-927098c64be6": ["Worldview"], // Choose optimism — Steph Ango
  "f05c2f9c-de78-4ecb-a553-24f836c8fa3a": ["Worldview"], // David Deutsch on Optimism — David Deutsch
  "9fe35f41-a780-4267-96e6-2a919b5f368f": ["Worldview"], // Default to empathy — Steph Ango
  "93ff802a-e0bb-44b8-9554-883a750ebf6a": ["Worldview"], // Desire is a contract that you make with yourself to be unhappy until… — Naval
  "6c731834-f107-4dd7-9a5f-458eb78e4eb9": ["Worldview"], // Do It Your Way — Morgan Housel
  "4e6b5a24-171e-440e-b0f6-1224e0dd79c5": ["Worldview"], // Do not accept the roles that society foists on you. Re-create… — Robert Greene
  "413f6485-02bd-4174-8e59-8de429aa0181": ["Worldview"], // Empathy is difficult — Seth Godin
  "bc0ceda9-a397-46f6-b0de-36f142214448": ["Worldview"], // Entitlement is optional — Seth Godin
  "3bf55a9e-7bfb-4971-abcb-b1140c41900c": ["Worldview"], // every single deeply good thing in life comes from sacrificing… — Tenobrus
  "a623d555-bc27-488f-85d8-a5d9be6e077e": ["Worldview"], // everything is a win when the goal is to experience — Sentimental Being
  "bc78a72e-c1e6-415f-bfe8-69f850bba39a": ["Worldview"], // Greatest Sermon Ever — Neil DeGrasse Tyson
  "ed4cad10-84db-4fbb-a409-183c6b37e968": ["Worldview"], // How to be perfectly unhappy — The Oatmeal
  "7463bd28-d5ee-4b57-ab92-62e40308fff4": ["Worldview"], // How to be useful to others — Derek Sivers
  "67dc3fe3-425d-4cbd-a02e-bbb00363bcc7": ["Worldview"], // How to Enjoy Life — David Cain
  "7f289190-1f12-4601-9554-c9dcfd847220": ["Worldview", "Thinking"], // How to Guarantee a Life of Misery — Charlie Munger
  "4d91924a-3491-444e-bab4-9ee302f914b1": ["Worldview"], // How to Improve Your Quality of Life by up to 90 Percent — David Cain
  "8ae81814-51af-4964-b7e0-d11b7bc277dd": ["Worldview"], // How to like people — Derek Sivers
  "9867a541-4d75-430a-88c1-c13057e76e6e": ["Worldview"], // How to live a good life — Ralph Ammer
  "8b6b7893-f68e-4825-bef9-4a77bff4307d": ["Worldview"], // How to Live your Life at Full Power — Graham Weaver
  "59071a8d-5ed3-4433-9f8c-99e34f85920d": ["Worldview"], // How to thrive in an unknowable future — Derek Sivers
  "ea589948-bfe4-4980-a454-e86d5792da72": ["Worldview", "Career"], // How Will You Measure Your Life? — Clay Christensen
  "5c9c9163-d5d8-42e1-9900-c6534a47bb1b": ["Worldview"], // I Know What You Think of Me — Tim Kreider
  "588e42dc-e513-47a2-b0ae-a5295d0c7458": ["Worldview"], // if more money wouldn't change how you spend your time, you're… — Jack Butcher
  "c47e213f-4e37-43e4-84dc-7dd9c9698f1b": ["Worldview"], // If you feel that you are in competition with anyone, for anything,… — Nassim Nicholas Taleb
  "a535e876-ac3c-45a4-9a0c-f6775e29b4dc": ["Worldview"], // Jim's 1993 ESPY Speech — Jim Valvano
  "41a84266-a52f-4edd-ac10-51e08ac1a7ef": ["Worldview"], // Just because you’re right… — Seth Godin
  "45b31c04-139a-42dc-a714-c501648198dd": ["Worldview"], // Labels — Venkatesh Rao
  "474b28e1-35c3-42b6-ad3a-bf09c662f61b": ["Worldview"], // Life Formulas — Naval
  "dba3ca99-b848-4bdf-83f4-3118d42201cb": ["Worldview"], // Life is fucking electric bro. Don’t fall for the doomer shit. Thats… — Goldie
  "e46bfb1c-feb2-4220-82df-94ff96b1a85f": ["Worldview"], // Life is suffering. The purpose of life is not to be happy, but to… — Dr Jordan B Peterson
  "410d63e4-868e-4854-9aff-3c95060a8fa7": ["Worldview"], // Many ways to win — Steph Ango
  "72281d06-e7d6-4af1-9990-142a8a5734ca": ["Worldview"], // Meaning of Life — John Danaher
  "a789d4de-3531-4415-b8db-b3e979dfe0ce": ["Worldview"], // Meaning of Life Playlist — Lex Fridman
  "8ea0377c-1dab-43cb-b8db-e03db34b2e75": ["Worldview"], // Moral letters to Lucilius/Letter 13 — Seneca
  "0aa95933-b420-40cc-8f10-df5b1017c03f": ["Worldview"], // No one can compete with you on being you. Most of life is a search… — Naval
  "2fc4a157-94e3-4485-a76e-12813323cb53": ["Worldview"], // Nobility — David Chapman
  "bed805c2-5ecd-4d25-be6b-644099f1aaff": ["Worldview"], // On Being Entirely Yourself — David Foster Wallace
  "8b8e6b8a-0f65-4fba-b510-b1009b226a34": ["Worldview"], // Optimistic Nihilism — Kurzgesagt
  "c4620ae7-9ea9-4d2b-95fb-942e3842ad0c": ["Worldview"], // Ordinary Abundance — Jordan Dworkin
  "806d9a2b-0248-4361-be94-64b1c82dc93e": ["Worldview"], // Pale Blue Dot — Carl Sagan
  "849e92f6-dcfc-4c1d-aa62-8a1710ac887c": ["Worldview"], // Please, Stop Playing Music Everywhere — Alex O'Connor
  "8f7ec053-130d-408e-9108-a4486cf11fc9": ["Worldview"], // Powers of Ten™ — Eames Office
  "34c61204-b616-407c-8d8d-52da3e794cab": ["Worldview"], // Purpose — Meaningness
  "789c68f3-7b81-42ff-92bf-8d076e19e141": ["Worldview"], // Random Ideas About Life — James Clear
  "9f1e14dc-0fbc-4d36-984f-696a963ad29d": ["Worldview"], // Real wealth is not about money. Real wealth is: -not having to go to… — James Clear
  "b1158e3b-8179-4b60-8aa9-5c98b42bd74f": ["Worldview"], // Regrets of the Dying — Bronnie Ware
  "655f90be-3977-4459-8d43-bbd57e685a76": ["Worldview"], // Respect and Admiration — Morgan Housel
  "6ec68903-615b-4fa3-bc13-dc52aaf8de9e": ["Worldview"], // Retirement starts when you stop sacrificing today for some imaginary… — Naval
  "8879e60d-cf76-4d8b-8153-4e8efa283c8e": ["Worldview"], // Rogers on Empathy Playlist — Carl Rogers
  "8c770e08-051c-4ad0-ba5a-52787d194394": ["Worldview"], // Roles People Play — Venkatesh Rao
  "df244f92-bb95-4357-a971-c9f20dc98a77": ["Worldview"], // Sam Harris basically unlocks the secret to life — Sam Harris
  "68f5e2dd-f580-472a-a160-aa9d8fbbb049": ["Worldview"], // saw an inspiring video that said you need to have 4 hobbies. create,… — divinely daria
  "6df44864-a637-4cb2-b805-746734b13e51": ["Worldview"], // Scars are beautiful — Steph Ango
  "6c6d7838-f0f1-4676-9a92-0f66b527218c": ["Worldview"], // Sorry to interrupt your scrolling but this is just a friendly… — Mark Manson
  "99f41bfb-22df-4398-b434-510f21bfd364": ["Worldview"], // Spent dinner last night with my bf discussing the hierarchy of man.… — Elena
  "1e120a0e-f081-4dae-bba2-b76af587844e": ["Worldview"], // Stereotypes — Venkatesh Rao
  "e32cada7-5046-4d33-8c8a-832fec8d8314": ["Worldview"], // Steve Jobs Secrets of Life — Steve Jobs
  "1d8f33b9-b2a8-44ec-bad5-acb0a1fe74a6": ["Worldview"], // Steve's Drafts — Steve Jobs
  "43ba8fde-9120-4de4-82c2-7ece4ee9e088": ["Worldview"], // The Ancient Greeks had two words for time: 1. Chronos = sequential,… — The Cultural Tutor
  "b03ae60c-575c-4b04-8675-bb70147853db": ["Worldview"], // the art of keeping in touch: > please please ALWAYS feel free to… — Adele Bloch
  "560026f4-67ed-47cf-a686-9c38a676b168": ["Worldview"], // The best measure of wealth is what you have minus what you want, and… — Morgan Housel
  "6a1ddb7a-87bf-41d0-820e-5b3192f9c150": ["Worldview"], // the duolingo owl — Helena Fitzgerald
  "c8035977-b058-4f60-aeaf-6af5c8859171": ["Worldview"], // The economy is just smart people paying beautiful people to promote… — Shaan Puri
  "17b10d15-cff6-443f-873d-8ec1dce9aad6": ["Worldview"], // The Egg — Andy Weir
  "113f573f-e2ec-4ff8-9b31-c551883e7091": ["Worldview"], // The Happiness Formula — Scott Adams
  "e01bbcc1-9db4-440f-be0c-ddaf1641dea3": ["Worldview"], // The Inner Ring — C.S. Lewis
  "e4f3e127-2546-4822-a177-3532093fd3da": ["Worldview"], // The Intelligent Social Web — Michael Smith
  "bdf8f528-a9ce-46fa-b0a7-025c215f1fa1": ["Worldview"], // The lottery winners (a secret of unhappiness) — Seth Godin
  "a8e56d1a-6501-4197-94a1-7dd56a6f1ce8": ["Worldview"], // The more neatly you fit into society, the less free you actually are. — Naval
  "4c0deb30-0732-44af-aa88-8134609853f5": ["Worldview"], // The only real test of intelligence is if you get what you want out… — Naval
  "55faf43b-ba16-43c2-bcf1-b0aa112b8f0f": ["Worldview"], // The Parable of the Fisherman — Adam Shand
  "2eb6e760-ae98-4883-9653-6abec52ea528": ["Worldview"], // The real use of money is to buy freedom — Paras Chopra
  "c39aa828-6b85-458d-8105-4fe1063fb37b": ["Worldview"], // The Self — Venkatesh Rao
  "74c726f0-a483-4195-be8d-5380e8043e79": ["Worldview"], // The Tail End — Tim Urban
  "08241689-57f0-4744-9a61-408267c438ca": ["Worldview"], // The Things We Leave Behind — Tom Greene
  "ad00b780-a186-47fd-bc2f-f02372b02968": ["Worldview"], // The Thirteen Necessary Virtues — Ben Franklin
  "a904bda7-57d3-45f8-9bfc-e1841cddb080": ["Worldview"], // The World from another point of view — Richard Feynman
  "4a660ace-4636-4465-acdb-5d64cbad14f5": ["Worldview"], // The World is a Word — Vosa
  "65293bcb-3e40-46de-add4-871cc62029a5": ["Worldview"], // There are 4 types of wealth: 1. Financial wealth (money) 2. Social… — James Clear
  "a7976b63-ef67-4e23-abb3-49401d05374f": ["Worldview"], // This is your life. — Holstee
  "c519db00-81b7-4186-ad04-2fa9b68c5754": ["Worldview"], // This Will Never Happen Again — David Cain
  "a8df548c-f772-49ee-a34c-fe208df2c7c9": ["Worldview"], // To listen well, get curious — Ben Kuhn
  "8351a4cf-89e5-457f-a79d-a8a102f4f125": ["Worldview"], // Unpopular opinion: social media hasn't ruined us—it's just revealed… — Mark Manson
  "f0839d51-4d43-4c6d-b7e5-f345459f8c2c": ["Worldview"], // Weirdness Budget — Venkatesh Rao
  "81e04ea4-4464-4644-9a7f-ce3432bec34f": ["Worldview", "Career"], // What If Money Was No Object? — Alan Watts
  "60b7c5f6-3264-498c-bd93-39f1b475ab66": ["Worldview"], // What is the secret of a good life? Lessons from the longest study on… — Veritasium
  "b20c8d10-0f3e-46fe-b0ba-8b73ae5520e8": ["Worldview"], // What on earth are you dooming about? — David Heinemeier Hansson
  "03b9bea4-64c9-4347-912c-76b3f18eb7af": ["Worldview"], // What We Really Want — Noam Chomsky
  "05210d24-fb60-4485-8049-eccaf39ffb3a": ["Worldview"], // Why Be Happy When You Could Be Interesting? — Slavoj Žižek
  "080099cb-e861-4b65-9d07-fcbe158d80c1": ["Worldview"], // Why time seems to pass faster as we age — Paras Chopra
  "e3935bb7-9ff6-489c-be57-4dcbe5e721b3": ["Worldview"], // You are not stressed from doing too much. You are stressed from… — Mark Manson
  "b3d63520-6da5-4b6b-a5e2-0f056091d5d6": ["Worldview"], // You can’t outwork the whole world. There’s always going to be… — DHH
  "86927269-047e-480f-bb22-3ecd666b7e5f": ["Worldview"], // Your parents miss you and wish you'd call. Later you'll miss them… — Paul Graham
  "ee7171d0-cb26-4548-8c08-cb0555c28a6c": ["Worldview"], // Your Real Biological Clock Is You're Going to Die — Tom Scocca
  "2e5c670d-8708-453c-9719-0ad3c9b2fd53": ["Worldview"], // Your success in life depends on your ability to make good decisions.… — Naval
  "d84fd0ab-e903-4686-8da4-f07e89d02f92": ["Worldview"], // Your Whole Life Is Borrowed Time — David Cain
  "9952c80c-2670-4738-8400-00d97714899e": ["Worldview"], // Your worth is not defined by what you achieve or acquire. It’s a… — Adam Grant

  // Career
  "4cd16dc3-5b92-4d86-9926-89ab83a15ff4": ["Career"], // 6 Things To Do In Your Early 20's — Patrick O'Shaughnessy
  "633ed237-4b8c-446a-81b5-6a6d3d559683": ["Career"], // Advice for ambitious 19 year olds — Sam Altman
  "8a7ce6f2-5730-4cf1-b917-e91234e326f6": ["Career"], // Advice I got early in my career: Don’t over engage in any… — Andrew Huberman
  "2a064fb4-4d76-4b48-a910-3f80724dfe8b": ["Career"], // Amazon Shareholder Letter (1997) — Jeff Bezos
  "e2a86963-dc40-4502-af71-bb01fe3903c9": ["Career"], // Arm Yourself With Specific Knowledge — Naval
  "c8809321-2735-46b6-b39e-f487fb9d9268": ["Career"], // Career Advice — Scott Adams
  "8f1c73fb-b868-4f15-97f9-1413d362650f": ["Career"], // competition — Shaan Puri
  "516d8cdb-0e00-464a-a85c-2b053ea4a7d5": ["Career"], // Don't ask to ask, just ask — Jari Komppa
  "39c0d03e-a19e-4ce0-b349-c8fb87b4b52a": ["Career"], // Duolingo Company Handbook — Duolingo
  "93e28581-31cb-4644-a32f-b3c718718d39": ["Career"], // Earn with your mind, not with your time. — Naval
  "c545aaf6-2a7a-4390-b169-6d58a3b1c5c9": ["Career"], // Escape Competition Through Authenticity — Naval
  "736e3924-b3d0-47da-9ea0-bd69676205b0": ["Career"], // Everything you've been told about burnout is wrong — Blake Scholl
  "e9abdac6-d39e-47ae-93fa-cdd7b8fe4ba4": ["Career"], // Face it: you're a crazy person — Adam Mastroianni
  "cc723689-b2df-4a22-9f91-be5bb2dec01c": ["Career"], // Facebook's Little Red Book — Facebook
  "19766a97-83f9-400a-a1ce-19c4db921811": ["Career", "Mindset"], // Fail Safe — Debbie Millman
  "552de872-26a8-403c-8409-83c0a23ae235": ["Career"], // Financial Advice for My New Son — Morgan Housel
  "d20b03c3-ef89-49ee-93a9-90415f54cba4": ["Career"], // Find Your Natural Tone of Voice — Rule The Room
  "3362319d-1ae9-41f7-822a-54b62bd2a570": ["Career"], // Find Your Specific Knowledge Through Action — Naval
  "a8b02a71-637b-4e8c-987c-e6aedda3b99e": ["Career"], // Finding Your True Passion Is A Cliché — Jordan Peterson
  "328683ee-0c3f-4efe-a762-13b0aedea8b0": ["Career"], // First Follower: Leadership Lessons from Dancing Guy — Derek Sivers
  "461fc4a4-eb3f-443d-8ac7-d6be98646602": ["Career"], // Hard work vs. Long work — Seth Godin
  "6df4c32b-7729-4cd2-85cf-f746cdcdbda2": ["Career"], // How to Be Different (without being lucky) — Zach Pogrob
  "e7311d59-f9ef-4d5a-8f4f-569115ed84d6": ["Career"], // How to be remarkable — Seth Godin
  "a896abab-3393-4db0-8909-9973a5801bcd": ["Career"], // How to Build Leverage from Scratch — Jack Butcher
  "7575ee7f-4ffa-458d-afce-d245a4853c0b": ["Career"], // how to enter side doors — Maja
  "e88a0eeb-cbc6-4b19-bee1-e5507ab087ad": ["Career"], // How to get rich — Derek Sivers
  "b526acf6-0f8b-44ee-bdc2-ed05e6dabcbd": ["Career"], // How to get your ideas to spread — Seth Godin
  "025e94fe-b5d2-4637-afef-0dedc0144913": ["Career"], // How to Increase Your Luck Surface Area — Jason Roberts
  "458dd164-1593-4f4d-9b5f-9fd1915d2d38": ["Career"], // How to Maximize Serendipity — David Perell
  "94e9013d-e90b-4e1b-adfe-a1e11a7b4aa3": ["Career"], // How to Speak — Patrick Winston
  "345f9239-5f97-4c56-9d79-fa13056b1245": ["Career"], // How to stop saying Um and Ah — Success Leaves A Trail
  "8f26eb9c-bb62-4be0-8467-f74969d2ce60": ["Career"], // HOW TO SUCCEED IN MRBEAST PRODUCTION — MrBeast
  "ca55c116-b36b-43d5-9f72-70aa70f5204b": ["Career"], // I learned a system for speaking articulately — Joseph Tsar
  "096e44ec-cfaa-488f-8441-61fe4cd009e3": ["Career"], // if everyone understands what you're doing, you're late — Jack Butcher
  "febd9b81-17af-4d14-a514-2581a0115bd0": ["Career"], // If you are pinging someone who’s busier than you, you should have a… — Balaji
  "48f29c52-a672-40f6-920f-460ec16a7cfa": ["Career"], // If you aren’t naturally tired at night and excited in the morning,… — Mark Manson
  "093fb1cc-b5fe-4cb1-9667-388efd1da2c3": ["Career"], // Improve Your Speaking — Conor Neill
  "b450ec0b-6b18-423f-a770-3c73eeddda02": ["Career"], // Long range career advice. (Won't help you get a job tomorrow, this… — Slava Akhmechet
  "06d51e70-8da2-43c6-a425-c9e903da6c1d": ["Career"], // Meeting people — Will Larson
  "c3ca7fa1-fd2a-4be8-92ce-9cd75056e995": ["Career"], // My definition of “Life’s Work:” “A lifelong quest to build something… — Patrick OShaughnessy
  "62b81dc1-a423-4ddc-b99a-cd464ef5892f": ["Career", "Mindset"], // Nobody Cares — Ben Horowitz
  "0a35ee78-f813-4dc6-805f-73f58470f4ea": ["Career"], // Notes on Roadtrips — The Browser Company
  "df77e822-864d-471e-ab69-85342e1d9eac": ["Career", "Worldview"], // On the Phenomenon of Bullshit Jobs: A Work Rant — David Graeber
  "77f7aa67-e695-4177-a49c-84aeb78a5c61": ["Career"], // Reject the tyranny of being picked: pick yourself — Seth Godin
  "b7cf2ecf-1bca-42c6-904b-a611bf07c45b": ["Career"], // Seek Wealth, Not Money or Status — Naval
  "239933d5-acaa-4097-b869-2aacccad964b": ["Career"], // Some lessons learned — Chris Dixon
  "7c008ba1-177b-4db4-bf6d-35e859dfa12e": ["Career"], // Stop Being Average — World Class Market Creation — Jack Butcher
  "9adb3837-5311-4a1b-af4a-dbf0009cb3c3": ["Career"], // The Algebra of Wealth: Scott Galloway on How To Get Rich — Scott Galloway
  "4f3698eb-38ce-42b0-8d57-f9744673b3b6": ["Career"], // The Art of Rhetoric: Ten Principles of Persuasive Speech — Paul Griffin
  "ab5bf635-46f3-450e-b826-fcdf22a01ead": ["Career"], // The Seven-Year Rule — MacSparky
  "341675ee-15f7-486c-9da6-d7ff8ca7e0e7": ["Career"], // The Single Most Important Ingredient in Becoming Influential — Conor Neill
  "6508c410-4d83-4564-bcb7-a55c8da44ecc": ["Career"], // The Struggle — Ben Horowitz
  "144711af-198c-42ec-8dfb-506e11093247": ["Career"], // The Trouble with Optionality — Mihir A. Desai
  "c7420124-a7e0-4d33-ae1a-97fc6c8f0717": ["Career"], // There's always time to launch your dream — David Heinemeier Hansson
  "f6027f25-11a6-4cef-987b-e72f84dcf55f": ["Career"], // Think Faster, Talk Smarter — Matt Abrahams
  "bf77006a-ea26-4d2a-acfa-21d5df3ef162": ["Career"], // Unsure What to Do With Your Life? Do This. — Adam Savage
  "c81fe9ff-1453-4a2d-ae61-3ccec2b5e4b8": ["Career"], // Video from Jeff Bezos about Amazon — Jeff Bezos
  "095bd9c0-77cc-44fb-8f93-1091f638ab51": ["Career"], // What feels like play to you, but looks like work to others? — Naval
  "55250f08-4ae9-4324-84c6-cf7749ff4d5f": ["Career"], // What important things does a 20-year-old need to know about money… — James Altucher
  "99ef53ea-4507-4a31-8afe-cc1e6fcfa975": ["Career"], // When should you give up on an idea? — Chris Dixon
  "33764da8-d5c1-4c23-ad9c-c0051c141a70": ["Career"], // When You Truly Work for Yourself — Naval
  "7b91701e-87e2-455e-b442-6a253946cbce": ["Career"], // working theory: a lot of “burnout” is just the result of prolonged… — anu
  "fb74aeac-5a15-4a23-89c3-d05951e053d4": ["Career"], // Would you suggest someone attend cooking school? — Anthony Bourdain
  "b0f9d394-efce-4a5a-bdcc-607c892fe771": ["Career"], // You have 12 shots in life — jessy
  "b0f2f1c8-569a-459a-bc0f-69583b1e2dc2": ["Career"], // You have 12 shots in life — Jessy

  // Greatness
  "556a297d-29a9-4e67-a838-8a72e3a33f67": ["Greatness"], // "I loved every minute of it, however hard it had been" — Andrew Wiles
  "babd7b20-3890-4ab9-802e-9e7d8eb62006": ["Greatness"], // "In Search of Excellence" at Apple Computer in 1984 — Steve Jobs
  "eb0b8b1f-8516-4110-aba6-0d46ed9f08ae": ["Greatness"], // "it takes hard work to achieve anything great" is a dangerous lie.… — Will Manidis
  "0887f80b-b601-4203-a26e-bb796559072c": ["Greatness"], // 2024 Commencement Address by Roger Federer at Dartmouth — Roger Federer
  "3bad2eb1-c5cd-42a8-b47a-11c8a052b24f": ["Greatness"], // Cities and Ambition — Paul Graham
  "120e4377-9bd5-46ad-b2c8-80d770547351": ["Greatness"], // GRIP STRENGTH — Jeremy Giffon
  "291b17b1-6bbb-4ee0-84e1-cc2d4dd27f3d": ["Greatness"], // How to Become the Best at What You Do — The Art of Improvement
  "5ff6d9fb-1cf2-40d1-8dd2-4ac459b94ffb": ["Greatness"], // How to Keep Winning — Amjad Masad
  "d1405746-b8e9-492d-b680-956adda7e7de": ["Greatness"], // If you aren’t getting rejected on a daily basis, your goals aren’t… — Chris Dixon
  "efc92939-37ac-41a0-a546-d28129d2569b": ["Greatness"], // Intelligence killed genius — Alexey Guzey
  "0fdec00d-7e6b-44f8-9ab9-bf2a7c51149b": ["Greatness"], // Irrational Dedication — Farnam Street
  "2cb31ef4-62ec-4281-8c16-78a963f77145": ["Greatness"], // It's a simple fact of life: if you want to do something incredible,… — Mark Manson
  "1053a565-890d-4e19-8543-60ac66b9fcdc": ["Greatness"], // Make an Extraordinary Effort — Eliezer Yudkowsky
  "2d9da9ec-4d4d-4b08-9194-07c3e7d6446a": ["Greatness"], // Not pouring your whole soul into your work is anti-life. In art, in… — Blond
  "e048d550-808e-46b4-9720-6ef0080bda73": ["Greatness"], // Omens of exceptional talent — Alexey Guzey
  "a7370b54-24ad-4172-9c40-3cbd854a4094": ["Greatness"], // On impact — Alexey Guzey
  "9ee73625-9866-488f-b8ee-85ff32fa6d3d": ["Greatness"], // Outliers: Why Some People Succeed and Some Don't — Malcolm Gladwell
  "c133362b-df28-409a-8560-b22fe113c2b8": ["Greatness"], // Play in Hard Mode — Zvi Mowshowitz
  "7f445803-fa71-490b-9d4b-875524a17ff7": ["Greatness"], // Playing to Win — Sirlin
  "e017b600-9f6d-4104-a3e3-b6d3b21528fe": ["Greatness"], // Richard St. John: "Success is a continuous journey" — TED
  "cebaa2d8-1237-4fa1-8af2-764cd1d2f551": ["Greatness"], // Secrets of success in 8 words, 3 minutes | Richard St. John — TED
  "881c4c24-9289-4869-966e-11a2c66a56a4": ["Greatness"], // Speech to the Academy of Achievement (June 1982) — Steve Jobs
  "1c73fc2c-ddd2-45c9-8a6c-f9ca3f8cdb40": ["Greatness"], // the best people are relentless in work, and relaxed in life. it's a… — blue
  "4262a18b-7742-4006-a6c1-c9de6652d198": ["Greatness"], // The four horsemen of mediocrity — Seth Godin
  "742c3ca7-8eb4-4cb4-a52d-cd90bbf8b1da": ["Greatness"], // The only alternative is to work harder — Paras Chopra
  "4a1557cc-57da-4e50-96d2-cc76b55162fa": ["Greatness"], // Work As Hard As You Can — Naval
  "ea0e8627-80b3-4983-9080-1493ab12e944": ["Greatness"], // You have one life. Don’t settle for mediocrity. — Naval
  "bf18e16a-8077-4908-843f-4015683b67a1": ["Greatness"], // You must first become consistent before you can become exceptional. — Alex Hormozi

  // Creativity
  "6a80e62d-656b-475a-95b1-3d5f096b2ed9": ["Creativity"], // "Finding Your Own Vision" — Arno Rafael Minkkinen
  "9734c389-fd48-4b9d-815f-98b673ffcf44": ["Creativity"], // 25 Rules For Artists — Make art not content.
  "5614d4d6-3419-4705-8a8c-1aed6792cd91": ["Creativity"], // A letter from Kurt Vonnegut, Jr. — Kurt Vonnegut
  "9bff3369-cea0-4ec6-b20f-3ad2aa6900aa": ["Creativity", "Greatness"], // A Project of One's Own — Paul Graham
  "3c5d84f1-3887-45b1-b64a-33c36b851e45": ["Creativity"], // Apple's Jony Ive on the Lessons He Learned From Steve Jobs — Jony Ive
  "2ff73013-2d2c-4fe7-b6f1-91b96877962b": ["Creativity"], // Art is what you do for its own sake. — Naval
  "09f1365d-d014-4e08-bf46-e23ac9361b94": ["Creativity"], // Composers as Gardeners — Brian Eno
  "b7d38843-b55a-452d-9ee9-f0348cda5998": ["Creativity"], // Creating on Principle — Patrick O'Shaughnessy
  "2bcd2a17-626c-4822-8521-e248128575b5": ["Creativity", "Thinking"], // Creative thinking — Edward de Bono
  "750fba28-ea7e-4b49-9b91-0749e5f5b57e": ["Creativity"], // Creativity is a combination of discipline and a childlike spirit. — Robert Greene
  "40e8bc5f-4774-41f4-a6f3-1af7af934e3f": ["Creativity"], // Creativity starts with an empty calendar and ends with a full one. — Naval
  "a14dd2b3-e032-48be-b971-03c1f01b8f5a": ["Creativity"], // David Bowie's Advice to Young Artists — David Bowie
  "2af65f52-4086-4d5d-b65c-8798dc127e1a": ["Creativity", "Career"], // David Lynch on 'not' launching a career — David Lynch
  "8e3d72c5-b2cf-41fd-82e0-405bae9b8365": ["Creativity"], // Defining Taste — Mitchell Hashimoto
  "7189a9a5-a8ab-4493-9838-5b6ecdbd05e6": ["Creativity"], // Developing Taste — Emil Kowalski
  "9f5983fc-46d9-4749-96ed-5829ccdee7df": ["Creativity"], // Ed Sheeran Songwriting Advice... — Ed Sheeran
  "e7ddaec3-af1b-4dcd-b6ab-6c01925c81fb": ["Creativity"], // every single good idea starts with a good conversation. optimize… — anu
  "a439caa2-e433-4d27-a83f-9714cbd66af3": ["Creativity"], // Everything is a Remix (Original Series) — Kirby Ferguson
  "0c5b91e9-5091-4fa2-aa15-04db825ecc3d": ["Creativity"], // How to get creative (without doing drugs): — George Mack
  "406b0301-a1c1-4f88-880f-321b854b9268": ["Creativity"], // How to Get New Ideas — Paul Graham
  "b8527742-7621-45ad-8b1e-ee19da496c43": ["Creativity"], // How to have good taste — Henry Oliver
  "f9429de4-1985-4084-aca6-f10dedf41f56": ["Creativity"], // I studied creativity for 365 days & here’s what I learned. — Deya
  "861881c5-d620-4874-8e6f-8dd4ed422cd9": ["Creativity"], // Idea Generation — Sam Altman
  "b63da06b-8d83-4fb7-b477-1104620fac8d": ["Creativity"], // If you want to be more creative, apply more constraints, not fewer. — Tim Ferriss
  "c80bbec1-59dd-4d8c-a448-f4c219e07972": ["Creativity", "Worldview"], // Inventing on Principle — Bret Victor
  "96c94de5-62f1-4e38-84a0-377f4815db5f": ["Creativity"], // Jerry Seinfeld is always looking for his next joke — Jerry Seinfeld
  "54cf726c-1ed2-45ca-a98c-2f126950e811": ["Creativity"], // Letters to a Young Creator — Steve Jobs Foundation
  "a19ff43f-196e-423b-9ce8-c680e6927a2d": ["Creativity", "Greatness"], // Make Something Heavy — Anu Atluru
  "5ef1c320-3e1e-4858-861d-a513a0b552f4": ["Creativity"], // Make Your Art. — vlogbrothers
  "7a0e9326-20a6-4b8e-99f0-251d966a2238": ["Creativity"], // On Making Money vs Quality Work — Saul Bass
  "c66e9033-a7ee-476b-beb0-b507c68740c2": ["Creativity"], // Taste — Sarah Guo
  "1796668a-dc02-42ee-94bb-27d6f264f7c3": ["Creativity"], // Teller Reveals His Secrets — Smithsonian
  "080d3361-8078-43bf-a24c-0556f01ea68f": ["Creativity"], // thank you, steve jobs — Spencer Schoeben
  "89453607-dda7-4f6e-9b06-1dfebac0cc04": ["Creativity"], // The 100:10:1 method — Nick Bentley
  "81ee05b2-83b9-414d-8567-f791e1603594": ["Creativity"], // The 6 Characteristics of Truly Creative People — Tina Seelig
  "524fee88-0493-4344-932b-3c6300c7f873": ["Creativity"], // The drawing advice that changed my life — struthless
  "b923267a-d84c-4ff4-87cc-68d16a5b004c": ["Creativity"], // The future is built by people who take their hobbies too seriously. — anu
  "fec146ba-6f8c-4ca7-a982-785d443bdabb": ["Creativity"], // The Gap — Ira Glass
  "045b55f8-6cdc-468f-ba18-665b5d8de0c8": ["Creativity"], // The Homework Theory: Making Music Effortless — Venus Theory
  "439c8ebc-d151-46e0-a7c0-91aab7a81803": ["Creativity"], // The Nature of Creativity and The Courage to Create — Academy of Ideas
  "5b1e6a01-e326-49a9-a235-4114719c75f3": ["Creativity"], // The Science of Creativity & How to Enhance Creative Innovation — Andrew Huberman
  "6e5d3185-ae1a-4e1a-a160-c2548ca8a489": ["Creativity"], // The Secret Truth About Executing Great Ideas — Frans Johansson
  "1990e3be-0fae-44f0-bb53-534b35ffe997": ["Creativity", "Career"], // the way of the artist-entrepreneur — Kening Zhu
  "b92c3bd0-e95b-4479-8ec1-3e0bbb9392a6": ["Creativity"], // Training the Idea Muscle — Aadil Pickle
  "4e577191-d077-4bb1-a471-dfedc3712c6c": ["Creativity"], // Tribute to Steve Jobs — Jony Ive
  "42444d93-a3f7-4c56-a207-1afe1b92bfd9": ["Creativity"], // Welcome address to freshman parents at Boston Conservatory — Karl Paulnack
  "02970124-87c1-4ad0-a58a-8ce9095b133d": ["Creativity", "Career"], // What the smartest people do on the weekend is what everyone else… — Chris Dixon
  "1ff8f511-c17a-4fd8-9cfe-760bdb9c0db1": ["Creativity"], // Where do ideas come from? — David Lynch
  "f84aa65c-e8f0-4997-8c27-4a79524b5e48": ["Creativity"], // Why Boredom is Good For You — Veritasium
  "5eb9c50e-3c5e-4033-b19a-178f33a7130c": ["Creativity"], // Why you should never play to the gallery — David Bowie
  "a568ad8e-07af-4403-a99c-118d9e994e6b": ["Creativity"], // Willingness to look stupid is a genuine moat in creative work — Sharif Shameem
  "32bbc599-49f4-4cb2-bffa-063acacdf982": ["Creativity"], // you can only cook what's in the fridge — Tim DeMoss
  "636c4681-09b0-4bb4-9b5b-ae14ab26af6f": ["Creativity"], // You Need to Be Bored. Here's Why. — Harvard Business Review
  "b9020413-66b3-4eeb-a638-a80e296855af": ["Creativity"], // You will be judged (or you will be ignored) — Seth Godin
  "171807e8-d8cb-4d3c-a004-c0369888f70c": ["Creativity"], // You've consumed enough. It's time to start creating. — Sam William
  "91e04a3e-6e88-4a7a-9c0c-1954c8f3cb93": ["Creativity"], // your life will get lighter when you center it around creation. you… — Will Manidis

  // Writing
  "937b15a7-536f-473a-9233-1efd2f7cc7fa": ["Writing"], // Expression is Compression — David Perell
  "38a25b85-29e4-4ad4-88eb-197845d67a21": ["Writing"], // How To Discover What You Have To Say — Burrhus Frederic Skinner
  "0965ccb5-d6f0-4697-8c56-a1233fc6298b": ["Writing", "Thinking"], // How to think in writing — Henrik Karlsson
  "78dcc47f-8c30-40d9-be8a-39aae507e723": ["Writing"], // How to Write Usefully — Paul Graham
  "b9ef9083-1326-4e60-b1b9-2396db916dc7": ["Writing", "Creativity"], // Ira Glass on Storytelling — Ira Glass
  "976e55ee-f735-44ee-bbf7-0f0b6c5da0ae": ["Writing", "Learning"], // Jordan Peterson - Read, Become Articulate, Transform the World — Jordan Peterson
  "1b094c89-773a-44b8-b72a-e2341292e095": ["Writing", "Learning"], // Learning By Writing — Holden Karnofsky
  "67ed2f4d-2935-4b4f-94bc-275e7a50e98e": ["Writing"], // Notes on writing well — Michael Nielsen
  "f65b0305-7a88-4c69-a1dc-a482cc64ad9c": ["Writing", "Creativity"], // Pixar's 22 Rules of Storytelling — Pixar
  "40295215-7473-4d65-8de2-4d9575e1eca3": ["Writing"], // Please Use AI — Shawn Smucker
  "ad7b87f8-257f-4a21-bfe5-0a5d3682d245": ["Writing", "Thinking"], // Putting Ideas into Words — Paul Graham
  "06906a8d-4ace-4c51-b74f-fa9c215d592a": ["Writing", "Creativity"], // The clues to a great story — Andrew Stanton
  "0b49971a-7a1c-42d8-9e86-c6b1345cb5b6": ["Writing"], // The Common Lie Writers Tell You — Brandon Sanderson
  "1aec3c70-daf0-4e0f-8ef4-3db2e160689d": ["Writing"], // The Craft of Writing Effectively — Larry McEnerney
  "c445cacc-b000-4d95-9a5b-0a4959244c44": ["Writing"], // The Day You Became a Better Writer — Scott Adams
  "f5ebe384-7e84-4dd7-8b2a-ab3becbd0c6b": ["Writing"], // The Golden Rule for Becoming a Better Writer — T.R Napper
  "698b3c6b-b76c-4a39-82f5-7ddb117d5d03": ["Writing"], // The Power of Writing — Jordan Peterson
  "ef200920-e448-4233-bb3e-d188442df473": ["Writing"], // Why I Write — George Orwell
  "7a368102-ce86-471d-8003-ffba310802a1": ["Writing"], // Write Like You Talk — Paul Graham
  "d0acacb8-d2ad-44a8-8259-5e7bb842e5e6": ["Writing"], // Write What You Know — George R. R. Martin
  "960e2ebc-33b6-49ee-931e-c396f82bebd7": ["Writing"], // Writing is more than a vehicle for communicating ideas. It's a tool… — Adam Grant

  // Thinking
  "c2523c90-65e7-43b2-a9db-4d8f3de5a2ca": ["Thinking"], // 100 Little Ideas — Morgan Housel
  "eb0d79d7-d9d0-4a89-acd6-b622d9dcd4fe": ["Thinking"], // 7 Step Problem Solving — BNETvideo
  "24f23a72-5bcf-49ce-b1cb-8e5f67a5e3aa": ["Thinking"], // A sign of intellect is the ability to change your mind in the face… — Adam Grant
  "6b5468bf-a81a-4b6b-9b2e-2102f984ab2a": ["Thinking"], // Avoiding Stupidity is Easier than Seeking Brilliance — Farnam Street
  "7cd939fd-3db1-4d00-83fe-dc704ef5a246": ["Thinking"], // Changing your mind doesn't mean you've abandoned your principles. It… — Adam Grant
  "c16d9d53-2b36-4132-954d-b6fc55eee542": ["Thinking"], // Cognitive Hygiene: Why You Need to Make Thinking Hard Again — JA Westenberg
  "2d670d00-2f2d-48ce-84c2-65c33479b12f": ["Thinking"], // Don't delegate understanding — Steph Ango
  "a4d240cf-a807-4723-83ad-f5265aaac8ab": ["Thinking"], // Elon Musk explains his 5-step algorithm — Elon Musk
  "0eb64116-9822-4742-8015-da4be28bfc99": ["Thinking"], // Epistemic Learned Helplessness — Slate Star Codex
  "09fb6587-f1e9-42b2-b77e-f9589d6e8bc0": ["Thinking"], // Examples of barbell strategies — Dwarkesh Patel
  "63b9996b-c1e9-4812-9da0-41375cb2265c": ["Thinking"], // Five whys — Wikipedia
  "6b53261d-e6f2-4c37-bdd5-8fa954e80bc9": ["Thinking"], // Frameworks are Fake — Venkatesh Rao
  "b5aebe4e-7d7e-4279-abca-d13ce746f2e3": ["Thinking"], // From Data to Wisdom — Russell Ackoff
  "8ef5e24d-b44a-49fc-a62c-0d2aa084faba": ["Thinking"], // How I'm Learning To Think Clearly — Joseph Tsar
  "cb757656-e016-42cc-ba77-2384ed47c496": ["Thinking"], // How to Disagree — Paul Graham
  "28714592-74f4-4f41-8d18-2caa59315108": ["Thinking"], // How to seem good at everything: Stop doing stupid shit — Josh
  "9c36a85b-e288-41b0-a345-ca7d73618bbe": ["Thinking"], // How to Solve a Problem in Four Steps: The IDEA Model — DecisionSkills
  "5629643f-19a1-4be0-8d61-381207545a59": ["Thinking"], // How to Think Originally — Odysseas
  "b928c6b8-87ec-476f-9399-221f08118dcb": ["Thinking"], // How to trade money and time — Katja Grace
  "aa1459f6-58e8-4db1-81f3-2c12be686c7b": ["Thinking"], // Humans are not automatically strategic — Anna Salamon
  "a158128d-4934-417a-99dc-46008e1f9b51": ["Thinking"], // Ignore sunk costs — Seth Godin
  "89d51159-33a4-4216-82b9-60bf00bd458f": ["Thinking"], // Improve Your Problem Solving Skills — Brian Tracy
  "3b14d49f-2e02-45ab-97a6-fab09d29624f": ["Thinking"], // Jeff Bezos explains one-way door decisions and two-way door decisions — Jeff Bezos
  "fb2d36fc-05f4-4b95-afb2-477ca3bd9d9c": ["Thinking"], // Just Lose Hope Already — Eliezer Yudkowsky
  "59fbbbd1-ad35-42b9-8f0e-41db122b5b7d": ["Thinking"], // Keep Your Identity Small — Paul Graham
  "2f36a064-c237-4948-b214-4b717ba19357": ["Thinking"], // Let pedestrians define the walkways — Derek Sivers
  "def52f4c-8f7e-42df-a15f-978561dd73ef": ["Thinking"], // LEVELS OF THINKING (Basic Version) — hoe_math
  "29a9659f-27a7-4d62-824f-b831c2060438": ["Thinking"], // Life is Poker, Not Chess — Robin Guo
  "28a918b1-da5b-436c-b151-8d4970853474": ["Thinking"], // Life lessons from an ad man — Rory Sutherland
  "eb12934c-5f4f-43ce-acac-baac617bb32e": ["Thinking"], // List of fallacies — Wikipedia
  "29cc1409-e08c-4648-9f5d-8286755cf01b": ["Thinking"], // Mental Models: The Best Way to Make Intelligent Decisions — Farnam Street
  "10999e61-bd44-4828-a167-d0ae9b42b2f7": ["Thinking", "Worldview"], // Message To Future Generations (1959) — Bertrand Russell
  "40ebebc6-6c7a-4156-9c8b-1059f6b52e3c": ["Thinking"], // MythBusters' Adam Savage on Problem Solving: How I Do It — Adam Savage
  "75622ea0-cbbe-4410-8598-a817563857a1": ["Thinking"], // No “yes.” Either “HELL YEAH!” or “no.” — Derek Sivers
  "dce41b27-30ed-402a-867c-daa9da805569": ["Thinking"], // Original Thinking — Peter Thiel
  "d47446be-91cb-4644-805f-d771ea54900e": ["Thinking"], // Plans are nothing, but planning is indispensable — Chris Dixon
  "6986ef32-a4fc-46cd-b7e2-b76ab1b4f9ca": ["Thinking"], // Reality has a surprising amount of detail — John Salvatier
  "ae19a28c-cf53-4b37-8c0e-aa98fc5204d2": ["Thinking"], // Regret Minimization Framework — Jeff Bezos
  "f0ce1163-8527-42b0-81f6-6ac301a3a29e": ["Thinking"], // Reversible and Irreversible Decisions — Farnam Street
  "9a5ff949-d05e-41c2-8f52-561e7f469af0": ["Thinking"], // Risk-based decision-making — RiskDoctorVideo
  "4671b7f4-845e-487e-9d2c-17ae24bb7743": ["Thinking"], // Rules for weird ideas — dynomight
  "867a6c68-55af-476d-a405-f5e2fc571c3d": ["Thinking"], // Simple heuristic: If you're evenly split on a difficult decision,… — Naval
  "566c8e32-996a-44fb-832d-c91f476f8d8d": ["Thinking"], // Stay in the Game — Drew Dickson
  "a1557b77-f0b5-4234-92a1-d6792b723a5c": ["Thinking"], // Survivorship Bias (Don't Believe the Hype) — Stephen Lynch
  "6908384f-a9e8-4a82-91b9-d9e13b66fbc3": ["Thinking"], // The brain is our hardware Human nature is our OS Culture is our… — Tim Urban
  "9ce8bc01-42e3-48a4-b3c8-40bd6fb51273": ["Thinking"], // The Evolution of Trust — Nicky Case
  "6d0e068e-3760-4c07-8a99-e434aae4c189": ["Thinking"], // The First Principles Method — Elon Musk
  "6db5114e-0e83-4bb3-bed8-8f7c7e8e934c": ["Thinking"], // The Four Quadrants of Conformism — Paul Graham
  "549b7ae8-e895-4ecb-9cf5-b1bbaa7275df": ["Thinking"], // The Musk Algorithm — David Heinemeier Hansson
  "b0e6d81a-d08c-4b7c-967d-abc39486be7e": ["Thinking"], // The Principles of Better Decisions. — Hades
  "d40250d6-f16b-45ba-a27f-32018b7b12de": ["Thinking"], // The Psychology of Problem-Solving — Edward O'Neill
  "3bbcf198-55c8-4e64-8b0a-7090e32acc0d": ["Thinking"], // The rarest (and most valuable) thing on this planet: a clear mind. — Nassim Nicholas Taleb
  "4972a76d-0efd-41ca-950b-1285f486639d": ["Thinking"], // The Risk of Discovery — Paul Graham
  "47c77f7e-e47c-4c65-9ce8-8fb06eecc9a6": ["Thinking"], // The short run and the long run — Seth Godin
  "1138d0e7-122d-4f96-8734-0eab559ed007": ["Thinking"], // The Thinkism Fallacy — Kevin Kelly
  "c1fbaa97-7755-4e5b-83a5-f3d230048824": ["Thinking"], // The wrong bus — Seth Godin
  "79c7d87e-98b5-48ce-bdc5-ae59c7779ed3": ["Thinking"], // Think real hard — Ben Kuhn
  "ae87b9a4-3430-4e21-9485-e9260dd5cb90": ["Thinking"], // This game theory problem will change the way you see the world — Veritasium
  "9551dcd8-bc94-41b6-a0b8-6df31c8ac6d6": ["Thinking"], // Unlocking Your Intuition: How to Solve Hard Problems Easily — Colin Galen
  "a05e8120-a2d9-484f-9bbb-d1403b882a6c": ["Thinking"], // Use Strategic Thinking to Create the Life You Want — Harvard Business Review
  "3d642540-82e1-403c-a7ac-a363a6375970": ["Thinking"], // Why We Cheat — Dan Ariely
  "0b5312a1-0577-49a5-9770-8657ea1af84e": ["Thinking"], // Working with problems — Seth Godin
  "0ed37334-337d-4156-8948-e7ea50c79094": ["Thinking"], // You can't tell people anything — Habitat Chronicles

  // Learning
  "0ebc892b-3c62-480b-b6e5-97f5a858daa0": ["Learning"], // # on shortification of "learning" There are a lot of videos on… — Andrej Karpathy
  "592c4070-c8d9-449f-ac3b-bb491c9ffce1": ["Learning"], // 102 Lessons from the 102 Books I Read This Year — Scott Young
  "3fb41105-62de-40bd-aa5a-8f89454f0f28": ["Learning"], // A Simple Way to Learn Complex Skills — Benjamin Keep
  "9dd00240-f489-4c04-a8ea-2bdf3a85df79": ["Learning"], // Advice for machine learning beginners — Andrej Karpathy
  "1385461a-9f76-4a4a-b522-083c0de70e17": ["Learning"], // Focusing Your Unconscious Mind: Learn Hard Concepts Intuitively (And… — Colin Galen
  "3b80583b-c402-416c-9dad-3eccce307108": ["Learning"], // Go Deeper, Not Wider — David Cain
  "f493e5ba-7e60-49d0-b1d6-84fc61296ad9": ["Learning"], // How Actors Remember Their Lines — John Seamon
  "2412f9ed-4a54-4b91-8dc5-f90e5357c030": ["Learning"], // How I practice at what I do — Tyler Cowen
  "7c3aff95-6eca-4646-8ed3-f1109b911be9": ["Learning"], // how I studied for 12 hours a day for over a year — James Scholz
  "703f9727-cca1-466f-894f-f62ac43347ff": ["Learning"], // How to become expert at thing: 1 iteratively take on concrete… — Andrej Karpathy
  "0f6a110f-4317-4294-bbb9-fde42d1ed27c": ["Learning"], // How to learn and master a new skill — Lex Fridman
  "c33ff3ca-fe36-4a12-aa4d-3d58c9385a2c": ["Learning"], // How to Memorize Anything — Jeffrey Kaplan
  "bde88b55-7a8a-4571-901b-0d55b244ef0f": ["Learning"], // How to Read 5 Books a Month — Cal Newport
  "25624efa-dfd6-446f-93a0-e1e577c63649": ["Learning"], // How to Read so that you *Retain* Information — Jeffrey Kaplan
  "d24d5c6b-e30f-417c-920b-647520ffb072": ["Learning"], // how to study and learn really difficult subjects: 1. don’t panic.… — Mustafa.
  "3a837487-2da6-4705-b75f-b6b18cf003a7": ["Learning"], // How to Time Travel — Brian Chesky
  "e809a91d-96f9-433e-b8ff-f8f9589baaf7": ["Learning"], // How to turn information into intelligence — Barbara Oakley
  "0a0cfea7-f581-4344-995f-dccb707e205c": ["Learning"], // How To Use The Brain More Effectively — Tony Buzan
  "70cf004e-ac07-495b-b1fc-e26e04d716bb": ["Learning"], // I’m seeing a growing number of students complain: “My grade doesn’t… — Adam Grant
  "de6e702b-b5fa-486d-a63c-58c5f94f1198": ["Learning"], // If you can speed read it, it isn't worth reading. — Naval
  "068c5f97-8025-461b-b32f-1422e08e06ee": ["Learning"], // Learn Faster with The Feynman Technique — Scott Young
  "ebc30915-81af-4008-a1ab-943a6240916e": ["Learning"], // Learning how to learn is the most important skill to acquire. — Robert Greene
  "4c9a1d83-2fb4-455f-8576-bcb9db902656": ["Learning"], // Learning to Learn — Jason Liu
  "189e9f86-17ea-400d-a5f9-574ded3ec36e": ["Learning"], // Read books because you will never be able to meet and spend… — Mark Manson
  "7f2dc158-4f66-4c36-9468-5364b431114a": ["Learning"], // Ten Mental Models for Learning — Scott Young
  "86d0d7af-3818-4009-9be6-e9678eb118aa": ["Learning"], // The Expert Myth — Veritasium
  "0af90505-ca99-4363-a4b2-71c6b8dc01f3": ["Learning"], // The Henry Adams Problem — Mothership
  "cd39faa5-8a42-47f8-9c9f-e09a63485acf": ["Learning"], // The Pleasure of Finding Things Out — Richard Feynman
  "394e46ec-d689-4543-bbdd-b5c8ed6bf8d8": ["Learning"], // the purpose of reading a book isn’t to retain information, it’s to… — anu
  "6ec11115-953e-4ede-9090-61378abb5de7": ["Learning", "Greatness"], // There’s no speed limit — Derek Sivers
  "aed450cc-9a28-4030-89af-0106d00bab85": ["Learning"], // We often avoid taking action because we think "I need to learn… — James Clear
  "2f37d0c2-6ed5-4f12-af2a-44562c0657a7": ["Learning"], // When Money Is Abundant, Knowledge Is The Real Wealth — LessWrong — John Wentworth
  "a192bd21-c52b-4193-a49e-7230c735eee0": ["Learning"], // You Are What You Read, Even If You Don’t Always Remember It — Jim Nielsen
  "41ba85df-0870-4e37-a924-87d52f903300": ["Learning"], // You can progress more in 6 minutes than you would in a month — Daniel Coyle

  // Productivity
  "f771f035-326f-45e7-b870-fc2d4f91e41a": ["Productivity"], // "Focusing is about saying no" - Steve Jobs (WWDC'97) — Steve Jobs
  "e661560f-5a17-4c43-a070-f994838c1381": ["Productivity"], // A Pretty-Good Mathematical Model of Perfectionism — Jesse Galef
  "c6c68526-5fac-4ad1-94b0-3e30cea3e03e": ["Productivity"], // Be impatient — Ben Kuhn
  "18823976-9e19-4d15-9155-9969d62f5ca7": ["Productivity"], // Cut the crap. Literally, cut the unnecessary distractions out of… — Mark Manson
  "667576fd-c6c9-4e57-a0b6-a7cc029815ae": ["Productivity"], // Don't Shave That Yak! — Seth Godin
  "68fac215-129a-4a85-ada8-459e2cd8d00f": ["Productivity"], // Energy makes time — Mandy Brown
  "06310dac-6869-4cce-bd11-4a566461b2c4": ["Productivity"], // Every productivity thought I've ever had, as concisely as possible -… — Alexey Guzey
  "0fa894b3-7a85-4701-b38d-ee57238fe73b": ["Productivity"], // Finish Work Faster by Copying How Olympic Athletes Train — Scott Young
  "c4ddfb0a-5c4e-41f6-98f8-69057af07737": ["Productivity"], // Focus Toolkit: Tools to Improve Your Focus & Concentration — Andrew Huberman
  "f6997045-10bc-4af8-8825-a01378b40012": ["Productivity"], // Four Things Procrastinators Need to Learn — David Cain
  "da1ca09f-24ad-4a11-ac76-9235d67bd155": ["Productivity"], // How I Learned That Focus Beats Discipline — Erkka “EJ” Suvanto
  "8cae4591-15f4-4018-a08f-bda5ff53848a": ["Productivity"], // How successful people achieve multiple goals (+ why you can't even… — James Lim
  "dba29576-62e3-4732-bea9-b0cfb5afe01d": ["Productivity"], // How things get done — Sam Altman
  "f2975780-294c-4548-a899-86c7d9bc4442": ["Productivity"], // How To Force Your Brain To Crave Doing Hard Things — Rian Doris
  "aac862ff-8ea7-4186-941c-55f1f2b926d7": ["Productivity"], // How to Get Yourself to Do Things — David Cain
  "57a7d6f6-a770-460b-b338-d11562674835": ["Productivity"], // How to Manage Multiple Interests — Odysseas
  "dafcf18f-d1ef-46a1-b938-ed777ae1cf45": ["Productivity"], // I think ambitious people should treat life in “seasons” rather than… — Aporia
  "5c2a428c-f13d-47a9-9bf9-923a552e3431": ["Productivity"], // I've recently found a productivity hack that moved me from bottom… — oreghall
  "7378b023-9cdb-459d-b9ff-f6d4824a6cd0": ["Productivity"], // If the internet isn’t making you richer or smarter, what are you… — Jack Butcher
  "43ed16d1-3152-4534-93d3-f1621df28218": ["Productivity"], // if you stay off your phone, you’ll realize you actually do have time… — anu
  "368ba05e-0440-43f2-87d6-8c34f1810e4d": ["Productivity"], // Learn to ask, “If this is the only thing I accomplish today, will I… — Tim Ferriss
  "9729bd08-7eef-4b99-960c-151526e6ef76": ["Productivity"], // Maker's Schedule, Manager's Schedule — Paul Graham
  "5980e1c6-0d44-4679-87b8-1206419b508b": ["Productivity"], // My grand theory of life is to just hammer the shit out of quadrant 4 — Ben James
  "304cf666-3eb3-405a-9c81-2c35c76300f7": ["Productivity"], // My Method for Defeating Procrastination — Jeffrey Kaplan
  "233f4235-2825-4b18-b519-46842f7b4411": ["Productivity"], // Nibble and your appetite will grow — Steph Ango
  "b14617f1-43d7-4494-8d6f-6942c079c9c3": ["Productivity"], // Productivity is overrated. What counts most is the quality of… — Adam Grant
  "329dc4e5-5bc2-4620-9de1-2ddaa6872d8a": ["Productivity"], // Resting is not a waste of time. It's an investment in well-being.… — Adam Grant
  "10359157-d1a9-4f1e-a5ef-9f7865338190": ["Productivity"], // Structured Procrastination — John Perry
  "302f1190-c2d9-42b1-9207-d077fec3e7c4": ["Productivity"], // The 80-hour Myth — Naval
  "86006478-b903-47d2-8fab-89fd8746772e": ["Productivity"], // The Art of Finishing — ByteDrum
  "99319330-e178-4691-bc27-9604d7666af3": ["Productivity"], // The Cult of Done Manifesto — Bre Pettis
  "34fb5aee-4b30-403b-a42f-ef463fc6fdb4": ["Productivity"], // The Perks of Living Without Social Media — Cal Newport
  "064d42e9-c4d0-418f-bc4c-24bf63a449e0": ["Productivity"], // The ultimate productivity hack is saying no. — James Clear
  "ff967abe-499b-48ba-a9a4-0bd10834e437": ["Productivity"], // Things That Aren't Doing the Thing — Strangest Loops
  "c81d5232-175e-45f2-97c4-e0a3f1b5b830": ["Productivity"], // Why The Smartest People I Know Set Constraints, Not Goals — JA Westenberg
  "947328d7-130f-41b6-a25a-d2daaace05dc": ["Productivity"], // you can beat 90% of people at anything just by not getting… — Anu Atluru
};
