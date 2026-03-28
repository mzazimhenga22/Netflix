const url = "https://s21.nm-cdn4.top/playlist.m3u8";
const regex = /\.nm-cdn(\d+)\.top/gi;
const result = url.replace(regex, '.freecdn$1.top');
console.log(`Input:  ${url}`);
console.log(`Output: ${result}`);

const url2 = "s21.nm-cdn4.top";
const result2 = url2.replace(regex, '.freecdn$1.top');
console.log(`Input 2:  ${url2}`);
console.log(`Output 2: ${result2}`);
