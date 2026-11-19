[![make.fun · news-image-20261119](https://make.fun/badge/news-image-20261119.svg)](https://make.fun/bounty/news-image-20261119)
[![rank](https://make.fun/badge/news-image-20261119/abixel-stars/news-image-20261119/rank.svg)](https://make.fun/bounty/news-image-20261119/leaderboard)
[![reward](https://make.fun/badge/news-image-20261119/abixel-stars/news-image-20261119/reward.svg)](https://make.fun/bounty/news-image-20261119)

# The World in One Day

A front page of a printed newspaper, drawn entirely in code, that sums up the world on Thursday, 19 November 2026.

## The image

"The World Bulletin" is a one page broadsheet on warm cream newsprint, in black ink, with vermilion red and teal as the only accents. The masthead carries the date, the issue number and the price, a weather strip runs underneath it, and the lead story takes the top half of the page: GTA VI launches worldwide, set over a hand drawn sunset skyline of Vice City with palm trees, lit windows, a red halftone sun and a car on the street. Below it, three columns cover the Anthropic IPO, the Trump, Xi and Putin meeting in Shenzhen, and Hakeem Jeffries making history, each with its own small illustration. The bottom row carries Voyager 1 reaching one light day from Earth and Cyclone Akvan nearing India. Paper grain and halftone dots give the page a printed texture that stays visible even at thumbnail size.

## The six stories

1. GTA VI launches worldwide, the biggest game launch in history, as players enter Vice City.
2. Anthropic lists on the stock market in an $81.3bn IPO, the biggest debut ever.
3. Trump, Xi and Putin meet for trilateral talks in Shenzhen, China.
4. Hakeem Jeffries becomes the first Black nominee for Speaker of the US House.
5. Voyager 1 reaches one light day from Earth, the farthest human made object, fifty years on.
6. Cyclone Akvan nears India, with 50,000 people evacuated in Odisha.

All six stories were first reported on 19 November 2026.

## How it is built

Run `node main.ts` (Node 22). The program draws the page with Node standard library only, no Python, writes `entry.png` into `$MAKEFUN_OUTPUT_DIR` (default `/output`), uses no network, and produces byte identical output on every run.
