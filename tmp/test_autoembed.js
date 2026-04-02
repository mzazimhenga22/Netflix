async function test() {
  const t = await fetch("https://autoembed.cc/api/getSources?id=24428");
  const d = await t.text();
  console.log("autoembed.cc:", d.substring(0, 500));
}
test();
