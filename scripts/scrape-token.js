const axios = require('axios');

async function checkSite() {
  try {
    const res = await axios.get('https://net22.cc/');
    console.log('Homepage content preview:');
    
    // Try to extract just text, not HTML tags, to see what the page says
    const text = res.data.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                         .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                         .replace(/<[^>]+>/g, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
                         
    console.log(text.substring(0, 500));
  } catch (e) {
    console.log('Error:', e.message);
  }
}

checkSite();
