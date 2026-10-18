// Programmatic use: a headless phone that logs in once, then posts, stories and notes.
//   node examples/basic.mjs photo.jpg
import { getConfig, InstagramMobile } from '../src/index.js';

const [photo] = process.argv.slice(2);
const ig = await InstagramMobile.launch(getConfig({ device: 'iPhone 15' }));

try {
  await ig.requireLogin(); // uses the saved session, or IG_USERNAME / IG_PASSWORD

  const me = await ig.profile(ig.config.username);
  console.log(`@${me.username}: ${me.followers} followers, ${me.posts} posts`);

  if (photo) {
    console.log(await ig.post([photo], { caption: 'Posted from a headless phone' }));
    console.log(await ig.story(photo));
  }

  console.log(await ig.note('Hello from Node', { audience: 'followers' }));
} finally {
  await ig.close();
}
