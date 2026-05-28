/* Times Table Quest — Flags game data
   ~193 countries grouped by region. Each record carries a flag emoji,
   capital, a brief flag description, and a verbal capital mnemonic that
   doesn't require mental imagery (aphantasia-friendly: sound-alikes and
   verbal links rather than "imagine" or "picture"). */

window.FLAG_GROUPS = [
  { id: 'nordic',         name: 'Nordic / Scandinavia' },
  { id: 'britIsles',      name: 'British Isles' },
  { id: 'westEur',        name: 'Western Europe' },
  { id: 'iberia',         name: 'Iberia' },
  { id: 'italyArea',      name: 'Italy & neighbours' },
  { id: 'centralEur',     name: 'Central Europe' },
  { id: 'balkans',        name: 'Balkans' },
  { id: 'baltic',         name: 'Baltic' },
  { id: 'eastSlavic',     name: 'East Slavic' },
  { id: 'caucasus',       name: 'Caucasus' },
  { id: 'centralAsia',    name: 'Central Asia' },
  { id: 'eastAsia',       name: 'East Asia' },
  { id: 'seAsia',         name: 'Southeast Asia' },
  { id: 'southAsia',      name: 'South Asia' },
  { id: 'middleEast',     name: 'Middle East' },
  { id: 'northAfrica',    name: 'North Africa' },
  { id: 'westAfrica',     name: 'West Africa' },
  { id: 'eastAfrica',     name: 'East Africa' },
  { id: 'centralAfrica',  name: 'Central Africa' },
  { id: 'southernAfrica', name: 'Southern Africa' },
  { id: 'northAmerica',   name: 'North America' },
  { id: 'centralAmerica', name: 'Central America' },
  { id: 'caribbean',      name: 'Caribbean' },
  { id: 'southAmerica',   name: 'South America' },
  { id: 'oceania',        name: 'Oceania' },
];

window.COUNTRIES = [
  // ===== Nordic / Scandinavia =====
  { id:'se', name:'Sweden',  capital:'Stockholm', group:'nordic', flag:'🇸🇪', flagDesc:'Yellow Nordic cross on blue.', capitalLink:'Stockholm = "stock home" — home of stocky Vikings.' },
  { id:'no', name:'Norway',  capital:'Oslo',      group:'nordic', flag:'🇳🇴', flagDesc:'Red with a blue Nordic cross outlined in white.', capitalLink:'Oslo sounds like "oh-slow" — slow fjords carved Norway.' },
  { id:'dk', name:'Denmark', capital:'Copenhagen',group:'nordic', flag:'🇩🇰', flagDesc:'White Nordic cross on red — the oldest in use.', capitalLink:'Copenhagen = "cope-n-hagen" — Danes cope with sea winds.' },
  { id:'fi', name:'Finland', capital:'Helsinki',  group:'nordic', flag:'🇫🇮', flagDesc:'Blue Nordic cross on white.', capitalLink:'Helsinki = "hell-sinky" — icy lakes sink your toes.' },
  { id:'is', name:'Iceland', capital:'Reykjavik', group:'nordic', flag:'🇮🇸', flagDesc:'Red Nordic cross outlined white on blue.', capitalLink:'Reykjavik = "rake-ya-vick" — volcanic vents rake the wick.' },

  // ===== British Isles =====
  { id:'gb', name:'United Kingdom', capital:'London', group:'britIsles', flag:'🇬🇧', flagDesc:'Union Jack — red & white crosses on blue.', capitalLink:'London = "Lon-done" — Big Ben says London is done at five.' },
  { id:'ie', name:'Ireland', capital:'Dublin', group:'britIsles', flag:'🇮🇪', flagDesc:'Vertical green-white-orange tricolour.', capitalLink:'Dublin = "double-in" — Guinness has a double-in malt.' },

  // ===== Western Europe =====
  { id:'fr', name:'France', capital:'Paris', group:'westEur', flag:'🇫🇷', flagDesc:'Vertical blue-white-red tricolour.', capitalLink:'Paris pairs with the Eiffel Tower — France’s pair-iss-fect city.' },
  { id:'de', name:'Germany', capital:'Berlin', group:'westEur', flag:'🇩🇪', flagDesc:'Horizontal black-red-yellow stripes.', capitalLink:'Berlin = "bear-lin" — Berlin’s symbol is the bear.' },
  { id:'nl', name:'Netherlands', capital:'Amsterdam', group:'westEur', flag:'🇳🇱', flagDesc:'Horizontal red-white-blue stripes.', capitalLink:'Amsterdam = "hamster-dam" — picture a dam holding canals.' },
  { id:'be', name:'Belgium', capital:'Brussels', group:'westEur', flag:'🇧🇪', flagDesc:'Vertical black-yellow-red tricolour.', capitalLink:'Brussels grows brussels sprouts — Belgium’s capital greens.' },
  { id:'lu', name:'Luxembourg', capital:'Luxembourg City', group:'westEur', flag:'🇱🇺', flagDesc:'Horizontal red-white-light-blue stripes.', capitalLink:'Capital shares the country’s name — Luxembourg in Luxembourg.' },
  { id:'ch', name:'Switzerland', capital:'Bern', group:'westEur', flag:'🇨🇭', flagDesc:'White Swiss cross on red square.', capitalLink:'Bern sounds like "burn" — but Swiss snow keeps it cool.' },
  { id:'at', name:'Austria', capital:'Vienna', group:'westEur', flag:'🇦🇹', flagDesc:'Horizontal red-white-red stripes.', capitalLink:'Vienna = "vee-enna" — Mozart’s violins fill the air.' },
  { id:'li', name:'Liechtenstein', capital:'Vaduz', group:'westEur', flag:'🇱🇮', flagDesc:'Horizontal blue-red, gold crown top-left.', capitalLink:'Vaduz = "vah-doots" — tiny princedom in the Alps.' },
  { id:'mc', name:'Monaco', capital:'Monaco', group:'westEur', flag:'🇲🇨', flagDesc:'Horizontal red over white.', capitalLink:'Country and capital share the name — one Monaco.' },

  // ===== Iberia =====
  { id:'es', name:'Spain', capital:'Madrid', group:'iberia', flag:'🇪🇸', flagDesc:'Horizontal red-yellow-red, coat of arms left.', capitalLink:'Madrid sounds like "mad rid" — bullfights, paella, mad fun.' },
  { id:'pt', name:'Portugal', capital:'Lisbon', group:'iberia', flag:'🇵🇹', flagDesc:'Vertical green-red, coat of arms over the join.', capitalLink:'Lisbon = "Liz-bun" — sweet Portuguese custard buns.' },
  { id:'ad', name:'Andorra', capital:'Andorra la Vella', group:'iberia', flag:'🇦🇩', flagDesc:'Vertical blue-yellow-red, coat of arms centred.', capitalLink:'Andorra la Vella = "Andorra valley" — Pyrenean mountain valley.' },

  // ===== Italy & neighbours =====
  { id:'it', name:'Italy', capital:'Rome', group:'italyArea', flag:'🇮🇹', flagDesc:'Vertical green-white-red tricolour.', capitalLink:'All roads lead to Rome — Italy’s ancient hub.' },
  { id:'sm', name:'San Marino', capital:'San Marino', group:'italyArea', flag:'🇸🇲', flagDesc:'Horizontal white over light blue, coat of arms.', capitalLink:'Country and capital share the name.' },
  { id:'va', name:'Vatican City', capital:'Vatican City', group:'italyArea', flag:'🇻🇦', flagDesc:'Vertical yellow-white, papal keys on white.', capitalLink:'Country and capital are the same — the Pope’s tiny state.' },
  { id:'mt', name:'Malta', capital:'Valletta', group:'italyArea', flag:'🇲🇹', flagDesc:'Vertical white-red, George Cross top-left.', capitalLink:'Valletta = "Val-letta" — Knights of Malta named it.' },

  // ===== Central Europe =====
  { id:'pl', name:'Poland', capital:'Warsaw', group:'centralEur', flag:'🇵🇱', flagDesc:'Horizontal white over red.', capitalLink:'Warsaw = "war saw" — saw many wars, still standing.' },
  { id:'cz', name:'Czech Republic', capital:'Prague', group:'centralEur', flag:'🇨🇿', flagDesc:'Horizontal white over red, blue triangle from the hoist.', capitalLink:'Prague = "Prah-g" — pragmatic city of bridges.' },
  { id:'sk', name:'Slovakia', capital:'Bratislava', group:'centralEur', flag:'🇸🇰', flagDesc:'Horizontal white-blue-red, coat of arms left.', capitalLink:'Bratislava = "brat-iss-lava" — bratty little brother of Prague.' },
  { id:'hu', name:'Hungary', capital:'Budapest', group:'centralEur', flag:'🇭🇺', flagDesc:'Horizontal red-white-green stripes.', capitalLink:'Budapest = "Buda" + "Pest" — twin cities across the Danube.' },

  // ===== Balkans =====
  { id:'gr', name:'Greece', capital:'Athens', group:'balkans', flag:'🇬🇷', flagDesc:'Blue-white stripes with white cross on blue corner.', capitalLink:'Athens = Athena’s city — Greek goddess of wisdom.' },
  { id:'al', name:'Albania', capital:'Tirana', group:'balkans', flag:'🇦🇱', flagDesc:'Black double-headed eagle on red.', capitalLink:'Tirana = "tee-rah-na" — Albanian capital, sounds like "terrain".' },
  { id:'mk', name:'North Macedonia', capital:'Skopje', group:'balkans', flag:'🇲🇰', flagDesc:'Yellow sun with eight rays on red.', capitalLink:'Skopje = "skop-yeh" — scope out Macedonia from here.' },
  { id:'bg', name:'Bulgaria', capital:'Sofia', group:'balkans', flag:'🇧🇬', flagDesc:'Horizontal white-green-red stripes.', capitalLink:'Sofia = wisdom (Greek) — Bulgaria’s wise capital.' },
  { id:'ro', name:'Romania', capital:'Bucharest', group:'balkans', flag:'🇷🇴', flagDesc:'Vertical blue-yellow-red tricolour.', capitalLink:'Bucharest = "Boo-charest" — Romania, land of Dracula.' },
  { id:'rs', name:'Serbia', capital:'Belgrade', group:'balkans', flag:'🇷🇸', flagDesc:'Horizontal red-blue-white, coat of arms left.', capitalLink:'Belgrade = "white city" — bel (white) + grad (city).' },
  { id:'me', name:'Montenegro', capital:'Podgorica', group:'balkans', flag:'🇲🇪', flagDesc:'Red field with gold border, double-eagle centre.', capitalLink:'Podgorica = "pod-gor-itsa" — under the mountain (Mt Gorica).' },
  { id:'ba', name:'Bosnia and Herzegovina', capital:'Sarajevo', group:'balkans', flag:'🇧🇦', flagDesc:'Blue with yellow triangle and white stars.', capitalLink:'Sarajevo = "sara-yay-vo" — site of the spark that lit WWI.' },
  { id:'hr', name:'Croatia', capital:'Zagreb', group:'balkans', flag:'🇭🇷', flagDesc:'Horizontal red-white-blue, checkered shield centre.', capitalLink:'Zagreb = "zah-grebb" — grab a coffee in Croatia’s grebby capital.' },
  { id:'si', name:'Slovenia', capital:'Ljubljana', group:'balkans', flag:'🇸🇮', flagDesc:'Horizontal white-blue-red, coat of arms top-left.', capitalLink:'Ljubljana = "loob-lyana" — "love" in Slovenian (ljubim = love).' },
  { id:'xk', name:'Kosovo', capital:'Pristina', group:'balkans', flag:'🇽🇰', flagDesc:'Blue with golden Kosovo outline and six stars.', capitalLink:'Pristina = "priss-teena" — pristine new capital.' },

  // ===== Baltic =====
  { id:'ee', name:'Estonia', capital:'Tallinn', group:'baltic', flag:'🇪🇪', flagDesc:'Horizontal blue-black-white stripes.', capitalLink:'Tallinn = "tall-inn" — tall medieval inns line the old town.' },
  { id:'lv', name:'Latvia', capital:'Riga', group:'baltic', flag:'🇱🇻', flagDesc:'Horizontal dark-red, white, dark-red.', capitalLink:'Riga sounds like "rigour" — Latvian capital with rigorous winters.' },
  { id:'lt', name:'Lithuania', capital:'Vilnius', group:'baltic', flag:'🇱🇹', flagDesc:'Horizontal yellow-green-red stripes.', capitalLink:'Vilnius = "vill-nyus" — village news of Lithuania.' },

  // ===== East Slavic =====
  { id:'ru', name:'Russia', capital:'Moscow', group:'eastSlavic', flag:'🇷🇺', flagDesc:'Horizontal white-blue-red stripes.', capitalLink:'Moscow = "moss-cow" — cows graze on Russian moss.' },
  { id:'by', name:'Belarus', capital:'Minsk', group:'eastSlavic', flag:'🇧🇾', flagDesc:'Red over green with traditional pattern at hoist.', capitalLink:'Minsk = "minsk" — like "mink" — Belarusian fur capital.' },
  { id:'ua', name:'Ukraine', capital:'Kyiv', group:'eastSlavic', flag:'🇺🇦', flagDesc:'Horizontal blue over yellow.', capitalLink:'Kyiv = "key-iv" — the key city of Ukraine.' },
  { id:'md', name:'Moldova', capital:'Chișinău', group:'eastSlavic', flag:'🇲🇩', flagDesc:'Vertical blue-yellow-red, coat of arms centre.', capitalLink:'Chișinău = "kishi-now" — kiss the Moldovan capital now.' },

  // ===== Caucasus =====
  { id:'ge', name:'Georgia', capital:'Tbilisi', group:'caucasus', flag:'🇬🇪', flagDesc:'White with red Saint George cross and four small crosses.', capitalLink:'Tbilisi = "tibby-lee-see" — see the warm-spring city.' },
  { id:'am', name:'Armenia', capital:'Yerevan', group:'caucasus', flag:'🇦🇲', flagDesc:'Horizontal red-blue-orange stripes.', capitalLink:'Yerevan = "yeh-reh-vahn" — Armenia’s ancient pink-stone capital.' },
  { id:'az', name:'Azerbaijan', capital:'Baku', group:'caucasus', flag:'🇦🇿', flagDesc:'Horizontal blue-red-green, white crescent and star.', capitalLink:'Baku = "bah-koo" — like a sneeze on the Caspian Sea.' },

  // ===== Central Asia =====
  { id:'kz', name:'Kazakhstan', capital:'Astana', group:'centralAsia', flag:'🇰🇿', flagDesc:'Light blue with golden sun, eagle, and pattern at hoist.', capitalLink:'Astana means "capital" in Kazakh — capital named "capital".' },
  { id:'uz', name:'Uzbekistan', capital:'Tashkent', group:'centralAsia', flag:'🇺🇿', flagDesc:'Blue-white-green stripes, crescent and stars.', capitalLink:'Tashkent = "tash-kent" — stash of Silk Road treasures.' },
  { id:'tm', name:'Turkmenistan', capital:'Ashgabat', group:'centralAsia', flag:'🇹🇲', flagDesc:'Green with carpet pattern at hoist, crescent and stars.', capitalLink:'Ashgabat = "ash-gah-bat" — white-marble city in the desert.' },
  { id:'kg', name:'Kyrgyzstan', capital:'Bishkek', group:'centralAsia', flag:'🇰🇬', flagDesc:'Red with yellow sun and crossed yurt-roof pattern.', capitalLink:'Bishkek = "bish-kek" — kebab capital of the steppe.' },
  { id:'tj', name:'Tajikistan', capital:'Dushanbe', group:'centralAsia', flag:'🇹🇯', flagDesc:'Horizontal red-white-green, gold crown and stars.', capitalLink:'Dushanbe = "Monday" in Tajik — Monday market town.' },

  // ===== East Asia =====
  { id:'cn', name:'China', capital:'Beijing', group:'eastAsia', flag:'🇨🇳', flagDesc:'Red with one large and four small yellow stars top-left.', capitalLink:'Beijing = "bay-jing" — northern capital ("bei" = north).' },
  { id:'jp', name:'Japan', capital:'Tokyo', group:'eastAsia', flag:'🇯🇵', flagDesc:'White field with a single red disc.', capitalLink:'Tokyo = "to" + "kyo" — eastern capital ("to" = east).' },
  { id:'kr', name:'South Korea', capital:'Seoul', group:'eastAsia', flag:'🇰🇷', flagDesc:'White with red-blue yin-yang and four black trigrams.', capitalLink:'Seoul = "soul" — South Korea’s soul city.' },
  { id:'kp', name:'North Korea', capital:'Pyongyang', group:'eastAsia', flag:'🇰🇵', flagDesc:'Wide red stripe between two blue stripes, red star left.', capitalLink:'Pyongyang = "pyong-yang" — pong-and-yang on the Taedong river.' },
  { id:'mn', name:'Mongolia', capital:'Ulaanbaatar', group:'eastAsia', flag:'🇲🇳', flagDesc:'Red-blue-red vertical with yellow soyombo at hoist.', capitalLink:'Ulaanbaatar = "Red Hero" — capital of horsemen.' },
  { id:'tw', name:'Taiwan', capital:'Taipei', group:'eastAsia', flag:'🇹🇼', flagDesc:'Red with blue canton and white sun.', capitalLink:'Taipei = "Tai-pay" — northern Taiwan ("pei" = north).' },

  // ===== Southeast Asia =====
  { id:'vn', name:'Vietnam', capital:'Hanoi', group:'seAsia', flag:'🇻🇳', flagDesc:'Red with a yellow five-pointed star centre.', capitalLink:'Hanoi = "ha-noy" — annoying motorbike traffic always going.' },
  { id:'la', name:'Laos', capital:'Vientiane', group:'seAsia', flag:'🇱🇦', flagDesc:'Red-blue-red horizontal, white disc centre.', capitalLink:'Vientiane = "vee-en-tee-an" — Lao’s sleepy Mekong capital.' },
  { id:'kh', name:'Cambodia', capital:'Phnom Penh', group:'seAsia', flag:'🇰🇭', flagDesc:'Blue-red-blue horizontal, white Angkor Wat centre.', capitalLink:'Phnom Penh = "pa-nom pen" — penned in by rivers.' },
  { id:'th', name:'Thailand', capital:'Bangkok', group:'seAsia', flag:'🇹🇭', flagDesc:'Red-white-blue-white-red horizontal stripes.', capitalLink:'Bangkok = "bang cock" — banging temples and tuk-tuks.' },
  { id:'mm', name:'Myanmar', capital:'Naypyidaw', group:'seAsia', flag:'🇲🇲', flagDesc:'Yellow-green-red stripes, large white star centre.', capitalLink:'Naypyidaw = "nay-pee-daw" — new royal abode in Myanmar.' },
  { id:'my', name:'Malaysia', capital:'Kuala Lumpur', group:'seAsia', flag:'🇲🇾', flagDesc:'14 red-white stripes, blue canton with yellow crescent and star.', capitalLink:'Kuala Lumpur = "muddy confluence" — KL sits at two rivers.' },
  { id:'sg', name:'Singapore', capital:'Singapore', group:'seAsia', flag:'🇸🇬', flagDesc:'Red over white, white crescent and five stars.', capitalLink:'Country and capital share the name — one tidy island.' },
  { id:'id', name:'Indonesia', capital:'Jakarta', group:'seAsia', flag:'🇮🇩', flagDesc:'Red over white, two horizontal stripes.', capitalLink:'Jakarta = "ja-kar-ta" — packed cars in the megacity.' },
  { id:'bn', name:'Brunei', capital:'Bandar Seri Begawan', group:'seAsia', flag:'🇧🇳', flagDesc:'Yellow with black-white diagonal stripes, red coat of arms.', capitalLink:'Bandar Seri Begawan = "bandar" means port — Brunei’s royal port.' },
  { id:'ph', name:'Philippines', capital:'Manila', group:'seAsia', flag:'🇵🇭', flagDesc:'Blue-red horizontal, white triangle with sun and stars at hoist.', capitalLink:'Manila = "ma-nila" — mañana folder, the Filipino capital.' },
  { id:'tl', name:'East Timor', capital:'Dili', group:'seAsia', flag:'🇹🇱', flagDesc:'Red with yellow and black triangles, white star.', capitalLink:'Dili = "dilly" — dilly-dally to East Timor’s capital.' },

  // ===== South Asia =====
  { id:'in', name:'India', capital:'New Delhi', group:'southAsia', flag:'🇮🇳', flagDesc:'Saffron-white-green horizontal, navy Ashoka wheel centre.', capitalLink:'New Delhi = "new deli" — pick up a fresh deli sandwich in India.' },
  { id:'pk', name:'Pakistan', capital:'Islamabad', group:'southAsia', flag:'🇵🇰', flagDesc:'Green with white crescent and star, white stripe at hoist.', capitalLink:'Islamabad = "Islam" + "abad" — abode of Islam.' },
  { id:'bd', name:'Bangladesh', capital:'Dhaka', group:'southAsia', flag:'🇧🇩', flagDesc:'Green field with red disc slightly off-centre.', capitalLink:'Dhaka = "dha-ka" — like "ducker" — duck under monsoons.' },
  { id:'np', name:'Nepal', capital:'Kathmandu', group:'southAsia', flag:'🇳🇵', flagDesc:'Two stacked crimson triangles, sun and moon — only non-rectangular flag.', capitalLink:'Kathmandu = "Kat-man-doo" — Cat-Man-Doo, Nepalese guru cat.' },
  { id:'bt', name:'Bhutan', capital:'Thimphu', group:'southAsia', flag:'🇧🇹', flagDesc:'Yellow-orange diagonal split with white dragon centre.', capitalLink:'Thimphu = "thim-foo" — thumbs-up for Bhutan’s mountain capital.' },
  { id:'lk', name:'Sri Lanka', capital:'Colombo', group:'southAsia', flag:'🇱🇰', flagDesc:'Maroon with golden lion and four bo-leaves; green and orange stripes at hoist.', capitalLink:'Colombo = "co-lombo" — cinnamon and tea cargo capital.' },
  { id:'mv', name:'Maldives', capital:'Malé', group:'southAsia', flag:'🇲🇻', flagDesc:'Red with green rectangle, white crescent.', capitalLink:'Malé = "mah-lay" — sounds like "molly" — tiny Maldives capital.' },
  { id:'af', name:'Afghanistan', capital:'Kabul', group:'southAsia', flag:'🇦🇫', flagDesc:'Black-red-green vertical with white emblem.', capitalLink:'Kabul = "Kah-bull" — bull-strong city in the Hindu Kush.' },

  // ===== Middle East =====
  { id:'tr', name:'Turkey', capital:'Ankara', group:'middleEast', flag:'🇹🇷', flagDesc:'Red field with white crescent and star.', capitalLink:'Ankara = "ang-ka-ra" — anchor of inland Turkey (Istanbul is bigger).' },
  { id:'cy', name:'Cyprus', capital:'Nicosia', group:'middleEast', flag:'🇨🇾', flagDesc:'White with copper-coloured island silhouette and olive branches.', capitalLink:'Nicosia = "nice-osha" — nice ocean-side capital.' },
  { id:'sy', name:'Syria', capital:'Damascus', group:'middleEast', flag:'🇸🇾', flagDesc:'Red-white-black horizontal with two green stars.', capitalLink:'Damascus = "duh-mass-cuss" — damask fabric, ancient Syrian craft.' },
  { id:'lb', name:'Lebanon', capital:'Beirut', group:'middleEast', flag:'🇱🇧', flagDesc:'Red-white-red horizontal, green cedar tree centre.', capitalLink:'Beirut = "bay-root" — by the bay, root of Lebanese culture.' },
  { id:'il', name:'Israel', capital:'Jerusalem', group:'middleEast', flag:'🇮🇱', flagDesc:'White with two horizontal blue stripes and blue Star of David.', capitalLink:'Jerusalem = "jer-roo-sa-lem" — sacred to many, in three faiths.' },
  { id:'ps', name:'Palestine', capital:'Ramallah', group:'middleEast', flag:'🇵🇸', flagDesc:'Black-white-green stripes with red triangle at hoist.', capitalLink:'Ramallah = "rah-mah-lah" — administrative seat in the West Bank.' },
  { id:'jo', name:'Jordan', capital:'Amman', group:'middleEast', flag:'🇯🇴', flagDesc:'Black-white-green stripes, red triangle with white star.', capitalLink:'Amman = "ah-mahn" — sounds like "ah, man!" — old citadel city.' },
  { id:'sa', name:'Saudi Arabia', capital:'Riyadh', group:'middleEast', flag:'🇸🇦', flagDesc:'Green with Arabic shahada and white sword below.', capitalLink:'Riyadh = "ree-yad" — read your Arabic in the desert capital.' },
  { id:'iq', name:'Iraq', capital:'Baghdad', group:'middleEast', flag:'🇮🇶', flagDesc:'Red-white-black horizontal with green Arabic script.', capitalLink:'Baghdad = "bag-dad" — Dad’s bag of treasures, ancient city.' },
  { id:'ir', name:'Iran', capital:'Tehran', group:'middleEast', flag:'🇮🇷', flagDesc:'Green-white-red with red emblem and Arabic borders.', capitalLink:'Tehran = "Teh-ran" — the ran-away Persian capital.' },
  { id:'kw', name:'Kuwait', capital:'Kuwait City', group:'middleEast', flag:'🇰🇼', flagDesc:'Green-white-red horizontal with black trapezoid at hoist.', capitalLink:'Capital echoes the country name — one Kuwait.' },
  { id:'bh', name:'Bahrain', capital:'Manama', group:'middleEast', flag:'🇧🇭', flagDesc:'White and red with serrated edge between.', capitalLink:'Manama = "mah-NAH-mah" — muh-nah-muh-nah, Muppet song city.' },
  { id:'qa', name:'Qatar', capital:'Doha', group:'middleEast', flag:'🇶🇦', flagDesc:'Maroon with serrated edge, white at hoist.', capitalLink:'Doha = "doh-ha" — d’oh, ha! Homer Simpson finds Qatar.' },
  { id:'ae', name:'United Arab Emirates', capital:'Abu Dhabi', group:'middleEast', flag:'🇦🇪', flagDesc:'Red vertical at hoist with green-white-black horizontal stripes.', capitalLink:'Abu Dhabi = "father of gazelle" — ruling-emirate capital.' },
  { id:'om', name:'Oman', capital:'Muscat', group:'middleEast', flag:'🇴🇲', flagDesc:'White-red-green horizontal with red vertical and emblem at hoist.', capitalLink:'Muscat = "muss-cat" — tabby muscat grape, Oman’s port.' },
  { id:'ye', name:'Yemen', capital:'Sana’a', group:'middleEast', flag:'🇾🇪', flagDesc:'Red-white-black horizontal stripes.', capitalLink:'Sana’a = "sah-nah" — sane gathering place of mountain Yemen.' },

  // ===== North Africa =====
  { id:'eg', name:'Egypt', capital:'Cairo', group:'northAfrica', flag:'🇪🇬', flagDesc:'Red-white-black horizontal with golden eagle of Saladin.', capitalLink:'Cairo = "ky-roh" — sounds like "Kai-row" — pyramids on the Nile.' },
  { id:'ly', name:'Libya', capital:'Tripoli', group:'northAfrica', flag:'🇱🇾', flagDesc:'Red-black-green horizontal with white crescent and star.', capitalLink:'Tripoli = "trip-oh-lee" — three (tri) ancient cities merged.' },
  { id:'tn', name:'Tunisia', capital:'Tunis', group:'northAfrica', flag:'🇹🇳', flagDesc:'Red field with white disc, red crescent and star centre.', capitalLink:'Tunis sounds like the country name — Tunis in Tunisia.' },
  { id:'dz', name:'Algeria', capital:'Algiers', group:'northAfrica', flag:'🇩🇿', flagDesc:'Green and white halves with red crescent and star.', capitalLink:'Algiers shares the country root — al-Jazair (the islands).' },
  { id:'ma', name:'Morocco', capital:'Rabat', group:'northAfrica', flag:'🇲🇦', flagDesc:'Red with green five-pointed pentagram (seal of Solomon).', capitalLink:'Rabat = "rah-bat" — rabbit hop to Morocco’s administrative city.' },
  { id:'sd', name:'Sudan', capital:'Khartoum', group:'northAfrica', flag:'🇸🇩', flagDesc:'Red-white-black horizontal with green triangle at hoist.', capitalLink:'Khartoum = "kar-toom" — cartoon-loud Nile confluence.' },
  { id:'ss', name:'South Sudan', capital:'Juba', group:'northAfrica', flag:'🇸🇸', flagDesc:'Black-red-green stripes with blue triangle and yellow star.', capitalLink:'Juba = "jooh-bah" — jubilant new capital (world’s newest country).' },
  { id:'mr', name:'Mauritania', capital:'Nouakchott', group:'northAfrica', flag:'🇲🇷', flagDesc:'Green field, red top and bottom stripes, gold crescent and star.', capitalLink:'Nouakchott = "no-ack-shot" — knock shot, Saharan desert capital.' },

  // ===== West Africa =====
  { id:'sn', name:'Senegal', capital:'Dakar', group:'westAfrica', flag:'🇸🇳', flagDesc:'Vertical green-yellow-red with green star centre.', capitalLink:'Dakar = "dak-kar" — dock-car at Africa’s western tip.' },
  { id:'gm', name:'Gambia', capital:'Banjul', group:'westAfrica', flag:'🇬🇲', flagDesc:'Red-blue-green horizontal stripes with thin white separators.', capitalLink:'Banjul = "ban-jool" — banjo on Gambia’s riverbank.' },
  { id:'gw', name:'Guinea-Bissau', capital:'Bissau', group:'westAfrica', flag:'🇬🇼', flagDesc:'Yellow-green horizontal, red vertical at hoist with black star.', capitalLink:'Bissau = country’s second word — Bissau in Guinea-Bissau.' },
  { id:'gn', name:'Guinea', capital:'Conakry', group:'westAfrica', flag:'🇬🇳', flagDesc:'Vertical red-yellow-green tricolour.', capitalLink:'Conakry = "con-uh-kree" — coastal cocoa-cracker capital.' },
  { id:'sl', name:'Sierra Leone', capital:'Freetown', group:'westAfrica', flag:'🇸🇱', flagDesc:'Horizontal green-white-blue stripes.', capitalLink:'Freetown = literally "free town" — for freed slaves resettled here.' },
  { id:'lr', name:'Liberia', capital:'Monrovia', group:'westAfrica', flag:'🇱🇷', flagDesc:'11 red-white stripes, blue canton with white star — looks like USA.', capitalLink:'Monrovia = named after US President James Monroe.' },
  { id:'ci', name:'Côte d’Ivoire', capital:'Yamoussoukro', group:'westAfrica', flag:'🇨🇮', flagDesc:'Vertical orange-white-green tricolour.', capitalLink:'Yamoussoukro = "yam-uh-soo-kroh" — yam farming inland capital.' },
  { id:'gh', name:'Ghana', capital:'Accra', group:'westAfrica', flag:'🇬🇭', flagDesc:'Horizontal red-yellow-green with black star centre.', capitalLink:'Accra = "ack-ra" — Ghana cracks open its cocoa beans.' },
  { id:'tg', name:'Togo', capital:'Lomé', group:'westAfrica', flag:'🇹🇬', flagDesc:'Five green-yellow stripes, red canton with white star.', capitalLink:'Lomé = "loh-may" — go low to Togo, Lomé’s on the coast.' },
  { id:'bj', name:'Benin', capital:'Porto-Novo', group:'westAfrica', flag:'🇧🇯', flagDesc:'Green vertical at hoist with yellow-red horizontal.', capitalLink:'Porto-Novo = "new port" — Portuguese named coastal capital.' },
  { id:'ng', name:'Nigeria', capital:'Abuja', group:'westAfrica', flag:'🇳🇬', flagDesc:'Vertical green-white-green stripes.', capitalLink:'Abuja = "ah-boo-jah" — a boo-yah, Nigeria’s purpose-built capital.' },
  { id:'ne', name:'Niger', capital:'Niamey', group:'westAfrica', flag:'🇳🇪', flagDesc:'Horizontal orange-white-green with orange disc centre.', capitalLink:'Niamey = "nee-ah-may" — near the Niger river, that’s the way.' },
  { id:'bf', name:'Burkina Faso', capital:'Ouagadougou', group:'westAfrica', flag:'🇧🇫', flagDesc:'Red over green horizontal with yellow star centre.', capitalLink:'Ouagadougou = "wag-uh-doo-goo" — wag-a-doo, fun to say.' },
  { id:'ml', name:'Mali', capital:'Bamako', group:'westAfrica', flag:'🇲🇱', flagDesc:'Vertical green-yellow-red tricolour.', capitalLink:'Bamako = "bama-ko" — Bama is going to Mali.' },
  { id:'cv', name:'Cape Verde', capital:'Praia', group:'westAfrica', flag:'🇨🇻', flagDesc:'Blue with white-red horizontal stripes and ten yellow stars.', capitalLink:'Praia = "praya" — Portuguese for "beach" — island capital.' },

  // ===== East Africa =====
  { id:'et', name:'Ethiopia', capital:'Addis Ababa', group:'eastAfrica', flag:'🇪🇹', flagDesc:'Green-yellow-red horizontal with blue disc and star.', capitalLink:'Addis Ababa = "new flower" in Amharic — fresh capital city.' },
  { id:'er', name:'Eritrea', capital:'Asmara', group:'eastAfrica', flag:'🇪🇷', flagDesc:'Red triangle with green and blue triangles, gold olive emblem.', capitalLink:'Asmara = "ass-mah-rah" — Italian-built highland capital.' },
  { id:'dj', name:'Djibouti', capital:'Djibouti', group:'eastAfrica', flag:'🇩🇯', flagDesc:'Light-blue and green with white triangle and red star at hoist.', capitalLink:'Country and capital share the name.' },
  { id:'so', name:'Somalia', capital:'Mogadishu', group:'eastAfrica', flag:'🇸🇴', flagDesc:'Light blue with white five-pointed star centre.', capitalLink:'Mogadishu = "moga-dishu" — pirate-port poetry of the Horn of Africa.' },
  { id:'ke', name:'Kenya', capital:'Nairobi', group:'eastAfrica', flag:'🇰🇪', flagDesc:'Black-red-green horizontal with crossed Maasai shield and spears centre.', capitalLink:'Nairobi = "Place of cool waters" in Maasai.' },
  { id:'ug', name:'Uganda', capital:'Kampala', group:'eastAfrica', flag:'🇺🇬', flagDesc:'Six black-yellow-red stripes with white disc and grey crowned crane.', capitalLink:'Kampala = "kam-pah-lah" — built on seven hills.' },
  { id:'rw', name:'Rwanda', capital:'Kigali', group:'eastAfrica', flag:'🇷🇼', flagDesc:'Light blue, yellow, green stripes with golden sun top-right.', capitalLink:'Kigali = "key-gah-lee" — gala key city of the Land of a Thousand Hills.' },
  { id:'bi', name:'Burundi', capital:'Gitega', group:'eastAfrica', flag:'🇧🇮', flagDesc:'Red-white-green saltire with three red stars on white centre.', capitalLink:'Gitega = "gi-tega" — got-a-go to inland Burundi.' },
  { id:'tz', name:'Tanzania', capital:'Dodoma', group:'eastAfrica', flag:'🇹🇿', flagDesc:'Diagonal black band on green-blue, with yellow edges.', capitalLink:'Dodoma = "doh-doh-mah" — like the dodo bird, but in Tanzania.' },
  { id:'km', name:'Comoros', capital:'Moroni', group:'eastAfrica', flag:'🇰🇲', flagDesc:'Yellow-white-red-blue stripes with green triangle and crescent at hoist.', capitalLink:'Moroni = "moh-roh-nee" — moronic? No — capital of fragrant islands.' },
  { id:'sc', name:'Seychelles', capital:'Victoria', group:'eastAfrica', flag:'🇸🇨', flagDesc:'Five oblique stripes radiating from hoist.', capitalLink:'Victoria — named after Queen Victoria, world’s smallest capital.' },
  { id:'mu', name:'Mauritius', capital:'Port Louis', group:'eastAfrica', flag:'🇲🇺', flagDesc:'Horizontal red-blue-yellow-green stripes.', capitalLink:'Port Louis = named after King Louis XV — French port history.' },
  { id:'mg', name:'Madagascar', capital:'Antananarivo', group:'eastAfrica', flag:'🇲🇬', flagDesc:'White vertical at hoist with red over green horizontal.', capitalLink:'Antananarivo = "ant-tan-an-arrive-oh" — ants arrive at the city of a thousand.' },

  // ===== Central Africa =====
  { id:'td', name:'Chad', capital:'N’Djamena', group:'centralAfrica', flag:'🇹🇩', flagDesc:'Vertical blue-yellow-red tricolour.', capitalLink:'N’Djamena = "in-jah-meh-nah" — pronounced "in" by, on the Chari river.' },
  { id:'cf', name:'Central African Republic', capital:'Bangui', group:'centralAfrica', flag:'🇨🇫', flagDesc:'Blue-white-green-yellow stripes crossed by red vertical.', capitalLink:'Bangui = "bahn-gee" — banged together at the rapids of the Ubangi.' },
  { id:'cm', name:'Cameroon', capital:'Yaoundé', group:'centralAfrica', flag:'🇨🇲', flagDesc:'Vertical green-red-yellow with yellow star centre.', capitalLink:'Yaoundé = "yah-oon-day" — yawn-day, sleepy hilly capital.' },
  { id:'ga', name:'Gabon', capital:'Libreville', group:'centralAfrica', flag:'🇬🇦', flagDesc:'Horizontal green-yellow-blue stripes.', capitalLink:'Libreville = "free city" in French — for freed slaves.' },
  { id:'gq', name:'Equatorial Guinea', capital:'Malabo', group:'centralAfrica', flag:'🇬🇶', flagDesc:'Green-white-red horizontal with blue triangle at hoist, coat of arms.', capitalLink:'Malabo = "mah-lah-boh" — capital sits on Bioko island.' },
  { id:'st', name:'São Tomé and Príncipe', capital:'São Tomé', group:'centralAfrica', flag:'🇸🇹', flagDesc:'Green-yellow-green horizontal with red triangle at hoist, two black stars.', capitalLink:'Capital echoes the country — São Tomé’s namesake island.' },
  { id:'cg', name:'Republic of the Congo', capital:'Brazzaville', group:'centralAfrica', flag:'🇨🇬', flagDesc:'Diagonal green-yellow-red bands.', capitalLink:'Brazzaville = named after explorer Brazza — across the river from Kinshasa.' },
  { id:'cd', name:'DR Congo', capital:'Kinshasa', group:'centralAfrica', flag:'🇨🇩', flagDesc:'Sky blue with red diagonal band edged in yellow, yellow star top-left.', capitalLink:'Kinshasa = "kin-shah-sah" — kin-share-saa, river-port megacity.' },
  { id:'ao', name:'Angola', capital:'Luanda', group:'centralAfrica', flag:'🇦🇴', flagDesc:'Red over black horizontal with yellow gear-and-machete.', capitalLink:'Luanda = "loo-an-dah" — lots of oil and dance on the Atlantic.' },

  // ===== Southern Africa =====
  { id:'zm', name:'Zambia', capital:'Lusaka', group:'southernAfrica', flag:'🇿🇲', flagDesc:'Green field with red-black-orange vertical stripes and orange eagle top-right.', capitalLink:'Lusaka = "loo-sah-kah" — lazy Saturday in Zambia’s plateau capital.' },
  { id:'zw', name:'Zimbabwe', capital:'Harare', group:'southernAfrica', flag:'🇿🇼', flagDesc:'Seven green-yellow-red-black stripes, white triangle with red star and Zimbabwe Bird.', capitalLink:'Harare = "hah-rah-ray" — hooray, Zimbabwe’s sunny capital.' },
  { id:'mw', name:'Malawi', capital:'Lilongwe', group:'southernAfrica', flag:'🇲🇼', flagDesc:'Black-red-green horizontal with rising sun on top stripe.', capitalLink:'Lilongwe = "lee-long-way" — a long way to Malawi’s capital.' },
  { id:'mz', name:'Mozambique', capital:'Maputo', group:'southernAfrica', flag:'🇲🇿', flagDesc:'Green-black-yellow horizontal with red triangle, AK-47, hoe and book.', capitalLink:'Maputo = "mah-poo-toh" — map-into Mozambique’s coastal capital.' },
  { id:'na', name:'Namibia', capital:'Windhoek', group:'southernAfrica', flag:'🇳🇦', flagDesc:'Diagonal red band edged white, blue triangle with sun, green triangle.', capitalLink:'Windhoek = "vint-hook" — wind hooks across Namibian dunes.' },
  { id:'bw', name:'Botswana', capital:'Gaborone', group:'southernAfrica', flag:'🇧🇼', flagDesc:'Light-blue field with horizontal black stripe edged in white.', capitalLink:'Gaborone = "gah-bah-roh-nay" — got-a-bone, Botswana’s safari city.' },
  { id:'za', name:'South Africa', capital:'Pretoria', group:'southernAfrica', flag:'🇿🇦', flagDesc:'Y-shaped green band with yellow border, red and blue, black triangle at hoist.', capitalLink:'Pretoria = "preh-tor-ree-ah" — pretty Tory, jacaranda blossom capital.' },
  { id:'ls', name:'Lesotho', capital:'Maseru', group:'southernAfrica', flag:'🇱🇸', flagDesc:'Blue-white-green horizontal with black mokorotlo (hat) centre.', capitalLink:'Maseru = "mah-seh-roo" — mountain kingdom’s administrative seat.' },
  { id:'sz', name:'Eswatini', capital:'Mbabane', group:'southernAfrica', flag:'🇸🇿', flagDesc:'Blue-yellow-red-yellow-blue stripes with shield and spears centre.', capitalLink:'Mbabane = "mm-bah-bah-nay" — Mbabane bah-bah, Eswatini executive capital.' },

  // ===== North America =====
  { id:'us', name:'United States', capital:'Washington, D.C.', group:'northAmerica', flag:'🇺🇸', flagDesc:'13 red-white stripes, blue canton with 50 white stars.', capitalLink:'Washington, D.C. — named for George Washington, first president.' },
  { id:'ca', name:'Canada', capital:'Ottawa', group:'northAmerica', flag:'🇨🇦', flagDesc:'Red-white-red vertical with red maple leaf centre.', capitalLink:'Ottawa = "ot-uh-wah" — out-a-way Canadian capital, not Toronto.' },
  { id:'mx', name:'Mexico', capital:'Mexico City', group:'northAmerica', flag:'🇲🇽', flagDesc:'Vertical green-white-red with eagle on cactus centre.', capitalLink:'Capital echoes the country — Mexico City in Mexico.' },

  // ===== Central America =====
  { id:'gt', name:'Guatemala', capital:'Guatemala City', group:'centralAmerica', flag:'🇬🇹', flagDesc:'Vertical light-blue-white-light-blue with quetzal centre.', capitalLink:'Capital shares the country name — Guatemala City.' },
  { id:'bz', name:'Belize', capital:'Belmopan', group:'centralAmerica', flag:'🇧🇿', flagDesc:'Blue with red top and bottom edges, full coat of arms centre.', capitalLink:'Belmopan = "bell-moh-pan" — bell pan inland Belize capital.' },
  { id:'hn', name:'Honduras', capital:'Tegucigalpa', group:'centralAmerica', flag:'🇭🇳', flagDesc:'Blue-white-blue horizontal with five blue stars centre.', capitalLink:'Tegucigalpa = "teh-goo-see-gal-pah" — silver-mountain capital.' },
  { id:'sv', name:'El Salvador', capital:'San Salvador', group:'centralAmerica', flag:'🇸🇻', flagDesc:'Blue-white-blue horizontal with national coat of arms.', capitalLink:'Capital is the saint of the country — San Salvador in El Salvador.' },
  { id:'ni', name:'Nicaragua', capital:'Managua', group:'centralAmerica', flag:'🇳🇮', flagDesc:'Blue-white-blue horizontal with triangle and rainbow seal.', capitalLink:'Managua = "mah-nah-gwah" — main agua, lake-side capital.' },
  { id:'cr', name:'Costa Rica', capital:'San José', group:'centralAmerica', flag:'🇨🇷', flagDesc:'Five blue-white-red-white-blue horizontal stripes.', capitalLink:'San José — named for Saint Joseph — Costa Rican capital.' },
  { id:'pa', name:'Panama', capital:'Panama City', group:'centralAmerica', flag:'🇵🇦', flagDesc:'Quartered: white & red with blue & red stars.', capitalLink:'Capital echoes the country — Panama City and the canal.' },

  // ===== Caribbean =====
  { id:'cu', name:'Cuba', capital:'Havana', group:'caribbean', flag:'🇨🇺', flagDesc:'Five blue-white stripes with red triangle and white star at hoist.', capitalLink:'Havana = "ha-VAN-ah" — half-a-van of cigars and rum.' },
  { id:'jm', name:'Jamaica', capital:'Kingston', group:'caribbean', flag:'🇯🇲', flagDesc:'Yellow saltire dividing green and black triangles.', capitalLink:'Kingston = literally "King’s town" — Jamaica’s capital and reggae heart.' },
  { id:'ht', name:'Haiti', capital:'Port-au-Prince', group:'caribbean', flag:'🇭🇹', flagDesc:'Blue over red horizontal with white panel and coat of arms centre.', capitalLink:'Port-au-Prince = "port of the prince" — French naming.' },
  { id:'do', name:'Dominican Republic', capital:'Santo Domingo', group:'caribbean', flag:'🇩🇴', flagDesc:'Blue-red quarters separated by white cross with coat of arms.', capitalLink:'Santo Domingo — Saint Dominic — oldest European city in the Americas.' },
  { id:'bs', name:'Bahamas', capital:'Nassau', group:'caribbean', flag:'🇧🇸', flagDesc:'Aquamarine-yellow-aquamarine horizontal with black triangle at hoist.', capitalLink:'Nassau = "nass-aw" — pirate-haven capital.' },
  { id:'ag', name:'Antigua and Barbuda', capital:'Saint John’s', group:'caribbean', flag:'🇦🇬', flagDesc:'Black-blue-white triangles with rising sun on red field.', capitalLink:'Saint John’s — named for the apostle, on Antigua’s north coast.' },
  { id:'bb', name:'Barbados', capital:'Bridgetown', group:'caribbean', flag:'🇧🇧', flagDesc:'Blue-yellow-blue vertical with broken trident centre.', capitalLink:'Bridgetown — named for the Indian Bridge over the Careenage.' },
  { id:'dm', name:'Dominica', capital:'Roseau', group:'caribbean', flag:'🇩🇲', flagDesc:'Green field with cross of yellow-black-white and red disc with parrot.', capitalLink:'Roseau = "row-zoh" — named for the river-reeds.' },
  { id:'gd', name:'Grenada', capital:'Saint George’s', group:'caribbean', flag:'🇬🇩', flagDesc:'Red border with seven stars, green-yellow triangles, nutmeg at hoist.', capitalLink:'Saint George’s — named for England’s patron saint.' },
  { id:'kn', name:'Saint Kitts and Nevis', capital:'Basseterre', group:'caribbean', flag:'🇰🇳', flagDesc:'Black diagonal with yellow edges, green-red triangles, two white stars.', capitalLink:'Basseterre = "low land" in French — St Kitts’ capital.' },
  { id:'lc', name:'Saint Lucia', capital:'Castries', group:'caribbean', flag:'🇱🇨', flagDesc:'Light blue with black-yellow-white triangles centre.', capitalLink:'Castries = "kas-trees" — castle-trees, Saint Lucia’s harbour capital.' },
  { id:'vc', name:'Saint Vincent and the Grenadines', capital:'Kingstown', group:'caribbean', flag:'🇻🇨', flagDesc:'Vertical blue-yellow-green with three green diamonds on yellow.', capitalLink:'Kingstown — like Kingston but a town, Saint Vincent’s.' },
  { id:'tt', name:'Trinidad and Tobago', capital:'Port of Spain', group:'caribbean', flag:'🇹🇹', flagDesc:'Red field with diagonal black band edged in white.', capitalLink:'Port of Spain — Spanish-founded harbour on Trinidad.' },

  // ===== South America =====
  { id:'co', name:'Colombia', capital:'Bogotá', group:'southAmerica', flag:'🇨🇴', flagDesc:'Yellow (top half) with blue and red below.', capitalLink:'Bogotá = "boh-go-tah" — bog-go-ta high-altitude capital.' },
  { id:'ve', name:'Venezuela', capital:'Caracas', group:'southAmerica', flag:'🇻🇪', flagDesc:'Yellow-blue-red horizontal with eight white stars on blue.', capitalLink:'Caracas = "kah-rah-kahs" — caracara birds in Venezuelan capital.' },
  { id:'gy', name:'Guyana', capital:'Georgetown', group:'southAmerica', flag:'🇬🇾', flagDesc:'Green field with red-white triangles and gold-black arrow.', capitalLink:'Georgetown — named for King George III — only English-speaking S. Am. capital.' },
  { id:'sr', name:'Suriname', capital:'Paramaribo', group:'southAmerica', flag:'🇸🇷', flagDesc:'Green-white-red-white-green stripes with yellow star centre.', capitalLink:'Paramaribo = "para-mar-ee-bo" — para-marble, Dutch colonial capital.' },
  { id:'br', name:'Brazil', capital:'Brasília', group:'southAmerica', flag:'🇧🇷', flagDesc:'Green field with yellow rhombus and blue celestial sphere.', capitalLink:'Brasília — purpose-built modernist capital, name echoes Brazil.' },
  { id:'ec', name:'Ecuador', capital:'Quito', group:'southAmerica', flag:'🇪🇨', flagDesc:'Yellow-blue-red horizontal with coat of arms centre (yellow double).', capitalLink:'Quito = "kee-toh" — equator-line city in the Andes.' },
  { id:'pe', name:'Peru', capital:'Lima', group:'southAmerica', flag:'🇵🇪', flagDesc:'Vertical red-white-red tricolour.', capitalLink:'Lima = like the bean — Peruvian coast, where lima beans came from.' },
  { id:'bo', name:'Bolivia', capital:'Sucre', group:'southAmerica', flag:'🇧🇴', flagDesc:'Red-yellow-green horizontal stripes (with coat of arms on state flag).', capitalLink:'Sucre = "soo-kray" — sugar (sucre = sugar in French), constitutional capital.' },
  { id:'py', name:'Paraguay', capital:'Asunción', group:'southAmerica', flag:'🇵🇾', flagDesc:'Red-white-blue horizontal with national emblem centre.', capitalLink:'Asunción = "ascension" in Spanish — assumption-day naming.' },
  { id:'uy', name:'Uruguay', capital:'Montevideo', group:'southAmerica', flag:'🇺🇾', flagDesc:'Nine white-blue stripes with golden Sun of May at hoist.', capitalLink:'Montevideo = "mountain I see" — sailor’s shout sighting the hill.' },
  { id:'ar', name:'Argentina', capital:'Buenos Aires', group:'southAmerica', flag:'🇦🇷', flagDesc:'Light-blue-white-light-blue with golden Sun of May centre.', capitalLink:'Buenos Aires = "good airs" — fresh breeze on the river plate.' },
  { id:'cl', name:'Chile', capital:'Santiago', group:'southAmerica', flag:'🇨🇱', flagDesc:'White over red, blue square with white star at hoist.', capitalLink:'Santiago = Saint James in Spanish — Chilean capital under the Andes.' },

  // ===== Oceania =====
  { id:'au', name:'Australia', capital:'Canberra', group:'oceania', flag:'🇦🇺', flagDesc:'Blue with Union Jack canton, large white star, Southern Cross.', capitalLink:'Canberra = "can-bra" — purpose-built capital, a can-do compromise.' },
  { id:'nz', name:'New Zealand', capital:'Wellington', group:'oceania', flag:'🇳🇿', flagDesc:'Blue with Union Jack canton and four red Southern Cross stars.', capitalLink:'Wellington — named for the Duke; windy southern capital.' },
  { id:'pg', name:'Papua New Guinea', capital:'Port Moresby', group:'oceania', flag:'🇵🇬', flagDesc:'Diagonal: red top with yellow Bird of Paradise; black bottom with Southern Cross.', capitalLink:'Port Moresby — named for British naval officer Sir Fairfax Moresby.' },
  { id:'fj', name:'Fiji', capital:'Suva', group:'oceania', flag:'🇫🇯', flagDesc:'Light blue with Union Jack canton and Fijian shield.', capitalLink:'Suva = "soo-vah" — sue-va, port capital on Viti Levu.' },
  { id:'sb', name:'Solomon Islands', capital:'Honiara', group:'oceania', flag:'🇸🇧', flagDesc:'Yellow diagonal between blue (with five stars) and green.', capitalLink:'Honiara = "hoh-nee-ah-rah" — honey-area, Pacific palm capital.' },
  { id:'vu', name:'Vanuatu', capital:'Port Vila', group:'oceania', flag:'🇻🇺', flagDesc:'Black triangle at hoist with yellow Y; red over green.', capitalLink:'Port Vila — Pacific island capital, like a vanilla port.' },
  { id:'ws', name:'Samoa', capital:'Apia', group:'oceania', flag:'🇼🇸', flagDesc:'Red field with blue rectangle at hoist showing five Southern Cross stars.', capitalLink:'Apia = "ah-pee-ah" — apple-pee-yah, Samoan harbour town.' },
  { id:'to', name:'Tonga', capital:'Nuku’alofa', group:'oceania', flag:'🇹🇴', flagDesc:'Red with white rectangle at hoist showing red cross.', capitalLink:'Nuku’alofa = "abode of love" in Tongan.' },
  { id:'ki', name:'Kiribati', capital:'South Tarawa', group:'oceania', flag:'🇰🇮', flagDesc:'Red top with rising sun and frigatebird, blue-white wavy below.', capitalLink:'South Tarawa = "tah-rah-wah" — atoll capital straddling the equator.' },
  { id:'tv', name:'Tuvalu', capital:'Funafuti', group:'oceania', flag:'🇹🇻', flagDesc:'Light blue with Union Jack canton and nine yellow stars (one per island).', capitalLink:'Funafuti = "fun-a-foo-tee" — fun a-fute, tiny atoll capital.' },
  { id:'nr', name:'Nauru', capital:'Yaren (de facto)', group:'oceania', flag:'🇳🇷', flagDesc:'Blue with horizontal yellow stripe and a 12-pointed white star.', capitalLink:'Yaren — Nauru has no official capital; Yaren is where parliament sits.' },
  { id:'pw', name:'Palau', capital:'Ngerulmud', group:'oceania', flag:'🇵🇼', flagDesc:'Light blue with golden disc slightly off-centre toward hoist.', capitalLink:'Ngerulmud = "neh-rool-mood" — newly built capital on Babeldaob.' },
  { id:'mh', name:'Marshall Islands', capital:'Majuro', group:'oceania', flag:'🇲🇭', flagDesc:'Blue with diagonal orange-white bands and a 24-pointed white star.', capitalLink:'Majuro = "mah-joo-roh" — major-row of atoll islets, Marshall capital.' },
  { id:'fm', name:'Micronesia', capital:'Palikir', group:'oceania', flag:'🇫🇲', flagDesc:'Light blue with four white stars in a diamond.', capitalLink:'Palikir = "pah-lee-keer" — pally-care, capital on Pohnpei island.' },
];

/* Index helpers */
window.flagsByGroup = function flagsByGroup(groupId) {
  return window.COUNTRIES.filter(c => c.group === groupId);
};
window.flagById = function flagById(id) {
  return window.COUNTRIES.find(c => c.id === id);
};
