const axios = require('axios');
const cheerio = require('cheerio-httpcli');
const geolib = require('geolib');
// const knex = require('knex');
const url = require('url');

const getMansions = $ =>
  $('.cassetteitem')
    .map((_, el) => {
      const $mansion = $(el);
      const $rooms = $mansion
        .find('.cassetteitem-item')
        .find('tbody')
        .find('tr');

      return {
        name: $mansion.find('.cassetteitem_content-title').text(),
        address: $mansion.find('.cassetteitem_detail-col1').text(),
        rooms: $rooms.map((_, room) => formatRoom($(room))).toArray()
      };
    })
    .toArray();

const formatRoom = $room => {
  const floor = $room.find('td:nth-of-type(3)').text();
  const price = $room.find('td:nth-of-type(4)').text();
  const href = $room
    .find('td:last-of-type > a')
    .first()
    .attr('href');

  return {
    floor,
    href,
    price,
    fullUrl: url.resolve(process.env.BASE_URL, href)
  };
};

const PIXIV_OFFICE_COORDINATE = {
  latitude: 35.6809695,
  longitude: 139.7045637
};

const numberToKanji = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '七',
  8: '八',
  9: '九',
  '１': '一',
  '２': '二',
  '３': '三',
  '４': '四',
  '５': '五',
  '６': '六',
  '７': '七',
  '８': '八',
  '９': '九'
};

const numericRegExp = new RegExp(Object.keys(numberToKanji).join('|'), 'g');

const calcDistanceFromOffice = mansion =>
  new Promise((resolve, reject) => {
    const [city, town] = mansion.address.split('区');
    const targetCity = city.split('東京都')[1] + '区';
    const targetTown = town.replace(numericRegExp, ([m]) => numberToKanji[m]);

    axios
      .get(
        `http://geoapi.heartrails.com/api/json?method=getTowns&city=${encodeURIComponent(
          targetCity
        )}`,
        {}
      )
      .then(({ data }) => {
        if (!data.response.location) {
          return reject(data);
        }

        const target = data.response.location
          .filter(x => x)
          .find(area => area.town.includes(targetTown));
        const { x, y } = target;

        const distance = geolib.getDistance(
          { latitude: y, longitude: x },
          PIXIV_OFFICE_COORDINATE
        );

        mansion.distance = distance;
        mansion.within = distance <= 1200;

        resolve(mansion);
      });
  });

const sendToSlack = mansions =>
  axios.post(process.env.WEBHOOK_URL, {
    channel:
      process.env.NODE_ENV === 'development' ? '_bot_sandbox' : 'mansion',
    text: `新しいおうちが見つかりました\n${process.env.SEARCH_URL}`,
    unfurl_links: 1,
    attachments: mansions.map(mansion => ({
      fields: mansion.rooms.map(room => ({
        title: `${mansion.name} ${room.floor} ${room.price} 会社から約 ${
          mansion.distance
        }m`,
        value: `
          ${room.fullUrl}
          http://r1web.realwork.jp/index_c.html?1.2&${encodeURIComponent(
            mansion.name
          )}&
        `.replace(/ +/g, '')
      }))
    }))
  });

module.exports = () => {
  cheerio.fetch(process.env.SEARCH_URL, {}, (err, $, res) => {
    if (err) {
      throw err;
    }

    const mansions = getMansions($);

    Promise.all(mansions.map(calcDistanceFromOffice))
      .then(ms => ms.filter(m => m.within))
      .then(sendToSlack)
      .then(() => console.log('done! ✨'))
      .catch(console.error);
  });
};
