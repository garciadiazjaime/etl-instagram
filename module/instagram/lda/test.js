const { getTopics } = require('../data');

const post = {
  caption: 'Preparing Cabbage for Kimchi 🥬 Spring Batch 💐 \n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n•\n\n#eeeeeats #chicagoeats #chicago #chitown  #foodporn  #chicagofoodie #chicagofoodauthority #chicagofood #chicagofoodscene #chicagofoodblogger #chicagochef #chicagofoodanddrink #fresh #homemade #winter #spring #foodgasm  #asianfood #kimchi #kimchee #koreanfood #healthyfood #cleaneating #312food',
  accessibility: null,
  user: {
    fullName: 'Cafe Estrella',
  },
  location: {
    name: 'Chicago, Illinois',
  },
};
const terms = 10;

const topics = getTopics(post, terms);

console.log(JSON.stringify(topics, null, 2));
