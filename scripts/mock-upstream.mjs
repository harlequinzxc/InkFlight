/**
 * Mock SQ upstream for local integration testing ONLY.
 * Mirrors the documented /getcabin and /menu contract, including the
 * HTTP-200-with-statusCode-101 quirk and a realistic full /menu payload.
 */
import http from 'node:http';

const cabins = {
  getcabin: JSON.stringify({ cabinClasses: ['FCL', 'JCL', 'SCL', 'YCL'], statusCode: 200, statusMessage: 'Success', checksum: 'x' }),
  notfound: JSON.stringify({ statusCode: 101, statusMessage: 'No flight found.' })
};

const item = (name, description) => ({ name, description, longDescription: '', footnote: '', icons: ['WLSGD'], imagePathIfeLow: 'fabs/IFE/INFM/JCL/LOW/X.png', imagePathIfeHigh: 'fabs/IFE/INFM/JCL/HIGH/X.png' });

const menu = {
  flightNumber: '0003', flightDate: '2026-09-05', cabinClass: 'JCL', serviceType: 'J', statusCode: 200,
  legs: [
    {
      legseqno: 1,
      flightDetails: {
        departureAirportCode: 'SIN', departureCityName: 'Singapore',
        arrivalAirportCode: 'HND', arrivalCityName: 'Tokyo',
        departureLocalDate: '2026-09-05 07:15:00', arrivalLocalDate: '2026-09-05 15:05:00',
        departureUtcDate: '2026-09-04 23:15:00', arrivalUtcDate: '2026-09-05 06:05:00',
        flightStatus: 'SCHEDULED'
      },
      menu: { language: { EN_UK: {
        apologyFootnote: 'Please accept our apologies if your choice is unavailable.',
        meals: [
          {
            mealServiceNumber: '1', mealServiceCode: 'BFS_855', mealServiceName: 'Breakfast', mealServiceWriteUp: 'A selection of fresh seasonal produce.',
            selectionDetails: [
              { name: 'International Menu', code: 'ALC-International Menu', footnoteId: '', footnoteName: '', footnoteIconImagePath: '',
                mealCourses: [
                  { category: 'Appetiser', code: 'AP', maxSequence: 1, items: [item('Seasonal Fruit Plate', 'Tropical fruits with a lime drizzle')] },
                  { category: 'Main Course', code: 'MC', maxSequence: 3, items: [
                    item('Nasi Lemak with Chicken Rendang', 'Fragrant coconut rice, slow-braised chicken'),
                    item('Eggs Benedict', 'Poached eggs, smoked ham, hollandaise'),
                    item('Pan-Seared Salmon', 'Miso butter, seasonal greens')
                  ] },
                  { category: 'Dessert', code: 'DS', maxSequence: 1, items: [item('Dark Chocolate Cake', 'With gold-dusted ganache')] },
                  { category: 'Bread', code: 'BB', maxSequence: 1, items: [item('Assorted Breakfast Pastries', ''), item('Multigrain Toast', 'With butter and jam')] }
                ] },
              { name: 'Hanakoireki By Yoshihiro Murata', code: 'ETHNIC-Hanakoireki', footnoteId: 'ICP', footnoteName: 'International Culinary Panel', footnoteIconImagePath: '',
                mealCourses: [
                  { category: 'Main Course', code: 'MC', maxSequence: 2, items: [
                    item('Grilled Spanish Mackerel', 'Saikyo miso, ginger flower'),
                    item('Steamed Rice with Tororo', 'With pickled plum')
                  ] }
                ] }
            ]
          }
        ]
      } } },
      beverage: { language: { EN_UK: { categories: [
        { name: 'Champagne and Wine', categorySequence: 1, subcategories: [
          { name: 'Champagne', code: 'CH', footer: '', specialities: [{ itemType: '', items: [ { name: 'Charles Heidsieck Brut Réserve', description: '', header: '' } ] }] },
          { name: 'White', code: 'WH', footer: '', specialities: [{ itemType: '', items: [ { name: 'Cloudy Bay Sauvignon Blanc 2024', description: 'Marlborough, New Zealand', header: '' }, { name: 'Kistler Chardonnay 2023', description: 'Sonoma Coast', header: '' } ] }] },
          { name: 'Red', code: 'RD', footer: '', specialities: [{ itemType: '', items: [ { name: 'Penfolds Bin 389 Cabernet Shiraz 2022', description: 'South Australia', header: '' } ] }] }
        ] },
        { name: 'Spirits and Liqueurs', categorySequence: 2, subcategories: [
          { name: 'Whisky', code: 'WK', footer: '', specialities: [{ itemType: '', items: [ { name: 'The Macallan Double Cask 12', description: '', header: '' }, { name: 'Hibiki Japanese Harmony', description: '', header: '' } ] }] }
        ] },
        { name: 'Soft Drinks', categorySequence: 3, subcategories: [
          { name: 'Juices', code: 'JC', footer: '', specialities: [{ itemType: '', items: [ { name: 'Freshly Squeezed Orange Juice', description: '', header: '' }, { name: 'Tomato Juice', description: '', header: '' } ] }] }
        ] }
      ] } } },
      drySnack: {
        header: 'We have a variety of snacks available on request.',
        category: { name: 'Snacks', subcategories: [
          { name: 'Noodles', items: [ { name: 'Tom Yum Flavoured', description: '' }, { name: 'Abalone Noodles', description: '' } ] },
          { name: 'Biscuits & Nuts', items: [ { name: 'Quality Street Chocolates', description: '' }, { name: 'Mixed Nuts', description: '' } ] }
        ] }
      },
      amenities: {
        header: 'A selection of onboard amenities is available upon request.', footer: null,
        items: [ { itemName: 'Amenity Kit', itemDescription: '', imagePath: 'ifss/images/DM/JCL/1 Amenity Kit.png' }, { itemName: 'Eyeshade', itemDescription: '', imagePath: '' } ]
      },
      guestChef: { id: '', header: '', message: '' },
      isSnackBag: false, isBentoBox: false, isNoMenuPlanned: false, isHawkerPromo: false
    },
    {
      legseqno: 2,
      flightDetails: {
        departureAirportCode: 'HND', departureCityName: 'Tokyo',
        arrivalAirportCode: 'SIN', arrivalCityName: 'Singapore',
        departureLocalDate: '2026-09-05 17:10:00', arrivalLocalDate: '2026-09-05 23:45:00',
        departureUtcDate: '2026-09-05 08:10:00', arrivalUtcDate: '2026-09-05 14:45:00',
        flightStatus: 'SCHEDULED'
      },
      menu: { language: { EN_UK: {
        apologyFootnote: '',
        meals: [
          { mealServiceNumber: '1', mealServiceCode: 'SNCK', mealServiceName: 'Light Bites', mealServiceWriteUp: '',
            selectionDetails: [
              { name: 'International Menu', code: 'ALC-International Menu', footnoteId: '', footnoteName: '', footnoteIconImagePath: '',
                mealCourses: [ { category: 'Snack', code: 'SN', maxSequence: 1, items: [ item('Chicken Curry Puff', ''), item('Satay', 'Chicken and lamb skewers'), item('Ice Cream', 'Vanilla or chocolate') ] } ] }
            ] }
        ]
      } } },
      beverage: { language: { EN_UK: { categories: [
        { name: 'Soft Drinks', categorySequence: 1, subcategories: [ { name: 'Juices', code: 'JC', footer: '', specialities: [{ itemType: '', items: [ { name: 'Apple Juice', description: '', header: '' } ] }] } ] }
      ] } } },
      drySnack: {
        header: 'We have a variety of snacks available on request.',
        category: { name: 'Snacks', subcategories: [ { name: 'Noodles', items: [ { name: 'Tom Yum Flavoured', description: '' } ] } ] }
      },
      amenities: { header: '', footer: null, items: [] },
      guestChef: { id: 'GCH', header: 'Guest Chef', message: 'A special menu by Chef Kenji.' },
      isSnackBag: false, isBentoBox: false, isNoMenuPlanned: true, isHawkerPromo: false
    }
  ]
};

const snackBagMenu = JSON.stringify({
  flightNumber: '0002', flightDate: '2026-09-05', cabinClass: 'YCL', serviceType: 'Y', statusCode: 200,
  legs: [ {
    legseqno: 1,
    flightDetails: { departureAirportCode: 'SIN', departureCityName: 'Singapore', arrivalAirportCode: 'KUL', arrivalCityName: 'Kuala Lumpur',
      departureLocalDate: '2026-09-05 09:00:00', arrivalLocalDate: '2026-09-05 10:10:00',
      departureUtcDate: '2026-09-05 01:00:00', arrivalUtcDate: '2026-09-05 02:10:00', flightStatus: 'SCHEDULED' },
    menu: { language: { EN_UK: { meals: [] } } },
    beverage: { language: { EN_UK: { categories: [] } } },
    amenities: { header: '', footer: null, items: [] },
    guestChef: { id: '', header: '', message: '' },
    isSnackBag: true, isBentoBox: false, isNoMenuPlanned: false, isHawkerPromo: false
  } ]
});

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body || '{}'); } catch {}
    console.log(`[mock-upstream] ${req.url} flight=${parsed.flightNumber} date=${parsed.flightDate} cabin=${parsed.cabinClass ?? '-'} sessionId=${String(parsed.sessionId).slice(0, 8)}…`);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/getcabin') {
      const fn = Number(parsed.flightNumber);
      const d = String(parsed.flightDate ?? '');
      if (fn === 999 || (fn === 888 && d > '2026-09-10')) return res.end(cabins.notfound);
      return res.end(cabins.getcabin);
    }
    if (req.url === '/menu') {
      if (parsed.cabinClass === 'YCL') return res.end(snackBagMenu);
      return res.end(JSON.stringify(menu));
    }
    res.statusCode = 404;
    res.end('{}');
  });
}).listen(4560, '127.0.0.1', () => console.log('mock SQ upstream on :4560'));
