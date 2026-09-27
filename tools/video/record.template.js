// Сценарий записи ролика для playwright-cli run-code. Не запускать напрямую: make_record.py подставит длительности озвучки и путь.
async page => {
  const BASE = '__BASE__';
  const OUT = '__OUT__';
  const D = __DURATIONS__;
  const marks = {};
  const errors = [];
  const ctx = page.context();

  await page.setViewportSize({ width: 1920, height: 1080 });
  await ctx.grantPermissions(['geolocation'], { origin: 'https://flokko0-0.github.io' });
  await ctx.setGeolocation({ latitude: 43.0846, longitude: 76.972, accuracy: 9 });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '#/onboarding');
  await page.reload();
  await page.waitForTimeout(2500);

  // ---- Сцена для ролика: панель слева, телефон справа ----
  await page.addStyleTag({ content: `
    #side { display: none !important; }
    body { background: #0d2615 !important; }
    .shell { position: relative; z-index: 1; justify-content: flex-end !important; align-items: flex-start !important; padding: 130px 150px 0 0 !important; box-sizing: border-box; }
    .frame { flex: 0 0 430px !important; height: 900px !important; }
    #vstage { position: fixed; inset: 0; z-index: 0; pointer-events: none; color: #f3e8cc; font-family: var(--font); }
    #vstage .vtopo, #vcard .vtopo { position: absolute; inset: 0; width: 100%; height: 100%; color: #f3e8cc; opacity: .32; }
    #vtext { position: absolute; left: 110px; top: 540px; transform: translateY(-50%); width: 640px; transition: opacity .35s ease; }
    #vtext.fade { opacity: 0; }
    .vk { display: flex; align-items: center; gap: 14px; font: 800 22px var(--font); letter-spacing: .14em; text-transform: uppercase; color: #ffc926; margin-bottom: 20px; }
    .vk b { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: #ffc926; color: #14301d; font: 900 26px var(--display); letter-spacing: 0; }
    .vt { font: 900 92px/.9 var(--display); text-transform: uppercase; margin: 0 0 28px; text-wrap: balance; }
    .vp { font: 500 28px/1.42 var(--font); margin: 0 0 30px; opacity: .93; }
    .vchips { display: flex; flex-wrap: wrap; gap: 10px; }
    .vchips span { padding: 9px 18px; border-radius: 999px; border: 1.5px solid rgba(243,232,204,.4); font: 700 20px var(--font); }
    #vtext.narrow { width: 600px; left: 100px; }
    #vtext.narrow .vt { font-size: 76px; }
    #vtext.narrow .vp { font-size: 25px; }
    .vlabel { position: absolute; top: 76px; width: 430px; text-align: center; font: 800 20px var(--font); letter-spacing: .16em; text-transform: uppercase; color: #ffc926; opacity: 0; transition: opacity .5s; }
    .vlabel.on { opacity: 1; }
    #vlab-hiker { right: 150px; }
    #vlab-guard { left: 770px; }
    #vguard { position: absolute; left: 770px; top: 130px; width: 430px; height: 900px; border-radius: 28px; overflow: hidden; background: #f3e8cc; box-shadow: 0 30px 60px -20px rgba(0,0,0,.65); opacity: 0; transform: translateX(-40px); transition: opacity .6s, transform .6s; }
    #vguard.on { opacity: 1; transform: none; }
    #vguard iframe { width: 100%; height: 100%; border: 0; }
    #vcard { position: fixed; inset: 0; z-index: 50; display: grid; place-content: center; justify-items: center; gap: 22px; text-align: center; background: #0d2615; color: #f3e8cc; opacity: 0; transition: opacity .7s ease; pointer-events: none; font-family: var(--font); }
    #vcard.on { opacity: 1; }
    #vcard > *:not(.vtopo) { position: relative; }
    .vc-logo { display: grid; place-items: center; width: 110px; height: 110px; border-radius: 28px; background: #ffc926; color: #14301d; }
    .vc-logo svg { width: 70px; height: 70px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .vc-title { font: 900 200px/.85 var(--display); text-transform: uppercase; letter-spacing: .01em; }
    .vc-sub { font: 600 36px var(--font); opacity: .92; }
    .vc-case { font: 800 22px var(--font); letter-spacing: .16em; text-transform: uppercase; color: #ffc926; }
    .vc-facts { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; max-width: 1080px; }
    .vc-facts span { padding: 10px 20px; border-radius: 999px; border: 1.5px solid rgba(243,232,204,.4); font: 700 22px var(--font); }
    .vc-link { font: 600 40px var(--mono); color: #ffc926; }
  ` });

  await page.evaluate(async () => {
    const { drawTopo } = await import('./js/topo.js');
    const { icon } = await import('./js/ui.js');
    const stage = document.createElement('div');
    stage.id = 'vstage';
    stage.innerHTML = `<canvas class="vtopo"></canvas>
      <div id="vtext" class="fade"><div class="vk"><b></b><span></span></div><h1 class="vt"></h1><p class="vp"></p><div class="vchips"></div></div>
      <div class="vlabel" id="vlab-guard">Телефон мамы</div>
      <div class="vlabel" id="vlab-hiker">Телефон туриста</div>
      <div id="vguard"></div>`;
    document.body.prepend(stage);
    const card = document.createElement('div');
    card.id = 'vcard';
    card.innerHTML = '<canvas class="vtopo"></canvas><div id="vcard-in"></div>';
    document.body.append(card);
    requestAnimationFrame(() => document.querySelectorAll('.vtopo').forEach(drawTopo));
    window.__icon = icon;
  });

  const panel = (p) => page.evaluate(async (p) => {
    const t = document.getElementById('vtext');
    t.classList.add('fade');
    await new Promise((r) => setTimeout(r, 350));
    t.querySelector('.vk b').textContent = p.n;
    t.querySelector('.vk span').textContent = p.k;
    t.querySelector('.vt').textContent = p.t;
    t.querySelector('.vp').textContent = p.p;
    t.querySelector('.vchips').innerHTML = p.c.map((c) => `<span>${c}</span>`).join('');
    t.classList.toggle('narrow', !!p.narrow);
    t.classList.remove('fade');
  }, p);

  const card = (html, on) => page.evaluate(({ html, on }) => {
    if (html != null) document.getElementById('vcard-in').innerHTML = html;
    document.getElementById('vcard').classList.toggle('on', on);
    document.getElementById('vcard-in').style.cssText = 'display:grid;justify-items:center;gap:26px';
  }, { html, on });

  const mod = (path, fn, arg) => page.evaluate(async ({ path, fn, arg }) => {
    const m = await import(path);
    return fn.split('.').reduce((o, k) => o[k], m)(...(arg || []));
  }, { path, fn, arg });

  const smooth = (sel) => page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), sel);
  const wait = (ms) => page.waitForTimeout(ms);

  let t0 = Date.now();
  async function scene(id, fn, extraMs = 0) {
    const start = Date.now();
    marks[id] = start - t0;
    try {
      await fn();
    } catch (e) {
      errors.push(id + ': ' + e.message.split('\n')[0]);
    }
    const left = start + (D[id] + 0.9) * 1000 + extraMs - Date.now();
    if (left > 0) await wait(left);
  }

  const introLogo = await page.evaluate(() => window.__icon('mountain'));
  await card(`<div class="vc-logo">${introLogo}</div><div class="vc-title">Тау Серік</div><div class="vc-sub">Горный спутник для Заилийского Алатау</div><div class="vc-case">WIT Teens Hackathon · кейс Mountain Safe</div>`, true);
  await wait(900);
  await page.screencast.start({ path: OUT, size: { width: 1920, height: 1080 } });
  t0 = Date.now();
  await page.screencast.showActions({
    cursor: 'pointer', duration: 420,
    style: { point: 'width: 30px; height: 30px; border-radius: 50%; background: rgba(255, 201, 38, .55); box-shadow: 0 0 0 3px rgba(20, 48, 29, .55)', title: 'display: none' },
  });

  // 0. Заставка
  await scene('intro', async () => {
    await wait((D.intro + 0.1) * 1000);
    await card(null, false);
  });

  // 1. Регистрация по ИИН
  await scene('reg', async () => {
    await panel({ n: '1', k: 'Регистрация', t: 'ИИН и eGov', p: 'Возраст и пол берутся из ИИН, контрольная цифра ловит опечатку. Личность подтверждается через eGov, согласие на обработку данных по закону РК.', c: ['Проверка ИИН', 'eGov', 'Согласие родителя до 18'] });
    await page.getByRole('button', { name: 'Создать профиль' }).click();
    await page.locator('#ob-name').pressSequentially('Дана Серикова', { delay: 35 });
    await page.locator('#ob-iin').pressSequentially('091102604570', { delay: 55 });
    await wait(700);
    const boxes = page.locator('#consent-box label.check');
    await boxes.nth(0).click();
    await boxes.nth(1).click();
    await page.getByRole('button', { name: 'Подтвердить через eGov' }).click();
    await wait(500);
    const code = await page.locator('.egov-box b.mono').textContent();
    await page.locator('#ob-code').pressSequentially(code, { delay: 60 });
    await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await wait(900);
  });

  // Дальше - демо-профиль взрослого с медкартой и близкими
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    const core = await import('./js/core.js');
    s.state.profile = { ...s.demoProfile('adult'), done: true, consent: { at: Date.now(), parent: null } };
    s.state.company.profile = { about: 'Хожу по выходным, спокойный темп. Была на БАО и Кок-Жайляу, хочу на Кумбель.', tags: ['спокойный темп', 'фото'], only: 'all', prefs: 'Выходные', contactKind: 'phone', contact: '+7 701 000 33 44', visible: false };
    s.state.settings.countdown = 30;
    s.save();
    core.app.go('routes');
  });

  // 2. Маршрут, прогноз, риск, вещи
  await scene('route', async () => {
    await panel({ n: '2', k: 'До выхода', t: 'Риск до выхода', p: 'Реальные тропы OpenStreetMap и высоты Copernicus. Прогноз Open-Meteo на высоте вершины, закат, опыт и сезон: вердикт с объяснением и список вещей под погоду и медкарту.', c: ['OpenStreetMap', 'Copernicus DEM', 'Open-Meteo'] });
    await wait(300);
    await page.locator('.route-row[data-id="bao"]').click();
    await page.waitForSelector('.wx-strip:not(.skeleton)', { timeout: 12000 });
    await wait(400);
    await page.evaluate(() => document.querySelector('.chart-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(800);
    const box = await page.locator('.chart-box svg').boundingBox();
    for (let i = 0; i <= 12; i++) {
      await page.mouse.move(box.x + box.width * (0.14 + 0.8 * (i / 12)), box.y + box.height * 0.5);
      await wait(70);
    }
    await wait(300);
    await smooth('.wx-strip');
    await wait(2600);
    await smooth('.gear');
    await wait(700);
    await page.locator('label.gear-i').nth(0).click();
    await wait(300);
  });

  // 3. ИИ-помощник
  await scene('ai', async () => {
    await panel({ n: '3', k: 'ИИ-помощник', t: 'Спросите как друга', p: 'Gemini отвечает по-человечески, но опирается на реальный прогноз, оценку риска и ваш опыт. Без интернета отвечает встроенная сводка по тем же данным.', c: ['Gemini', 'Данные приложения, а не догадки'] });
    await mod('./js/core.js', 'app.go', ['assistant']);
    await wait(700);
    await page.locator('#ask-q').click();
    await page.locator('#ask-q').pressSequentially('Привет! Завтра в 7 хочу на БАО, как там?', { delay: 32 });
    await page.locator('#ask-q').press('Enter');
    await wait(1000);
    for (let i = 0; i < 30 && (await page.locator('[data-streaming]').count()); i++) await wait(500);
    await wait(300);
    await page.evaluate(() => document.querySelector('.msgs')?.lastElementChild?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await wait(2600);
  });

  // 4. Старт похода
  await scene('start', async () => {
    await panel({ n: '4', k: 'На тропе', t: 'Поход начат', p: 'Близкие получают маршрут и контрольное время. Телефон следит за падением, криком и кодовым словом на русском или казахском.', c: ['Контрольное время', 'Время разворота', 'Трек'] });
    await mod('./js/core.js', 'app.go', ['route', 'bao']);
    await page.waitForSelector('.cta-bar .btn', { timeout: 10000 });
    await wait(800);
    await page.locator('.cta-bar .btn').click();
    await wait(1100);
    await page.getByRole('button', { name: 'Выхожу на тропу' }).click();
    await wait(1200);
    // На ноутбуке нет акселерометра и микрофона: показываем датчики так, как они выглядят на телефоне
    await page.evaluate(async () => {
      const { status } = await import('./js/sensors.js');
      const core = await import('./js/core.js');
      const set = () => Object.assign(status, { fall: 'on', sound: 'on', speech: 'on', g: 0.97 + Math.random() * 0.08, db: -58 + Math.random() * 14 });
      set();
      window.__sens = setInterval(set, 120);
      core.app.refresh();
    });
    const code = await page.evaluate(async () => (await import('./js/store.js')).state.profile.familyCode);
    await page.evaluate(({ url }) => {
      document.getElementById('vguard').innerHTML = `<iframe src="${url}" title="Экран близкого"></iframe>`;
    }, { url: BASE + 'guardian.html#' + code });
    await mod('./js/safety.js', 'demoWalk', [0.06]);
    await wait(700);
  });

  // 5. Падение и SOS: у мамы на экране тревога
  await scene('sos', async () => {
    await panel({ narrow: true, n: '5', k: 'Если беда', t: 'SOS без рук', p: 'Падение, долгий крик или кодовое слово. Телефон спрашивает «Вы в порядке?», и если ответа нет, близкие получают координаты, высоту и медкарту. У мамы звучит сирена.', c: ['Акселерометр', 'Микрофон', 'AES-256'] });
    await page.evaluate(() => {
      document.getElementById('vguard').classList.add('on');
      document.querySelectorAll('.vlabel').forEach((l) => l.classList.add('on'));
    });
    await wait(1600);
    await mod('./js/safety.js', 'demoWalk', [0.08]);
    await wait(600);
    marks.check = Date.now() - t0;
    await mod('./js/safety.js', 'triggerCheck', ['Похоже на падение', { detail: '3,1 g, свободное падение 240 мс' }]);
    await wait(3600);
    await page.locator('.ov-help').click();
    marks.sosSent = Date.now() - t0;
    await wait(6500);
  });

  // 6. Без связи и первая помощь
  await scene('offline', async () => {
    await panel({ n: '6', k: 'Без связи', t: 'Работает офлайн', p: 'Сигнал ждёт в очереди и уходит, как только появится сеть. Карта, трек, укрытия, родники и 17 памяток первой помощи всегда на телефоне.', c: ['Очередь сообщений', 'SMS и 112', 'PWA'] });
    await page.evaluate(() => {
      document.getElementById('vguard').classList.remove('on');
      document.querySelectorAll('.vlabel').forEach((l) => l.classList.remove('on'));
    });
    const hold = await page.locator('.hold').boundingBox();
    await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
    await page.mouse.down();
    await wait(2250);
    await page.mouse.up();
    await wait(400);
    await mod('./js/core.js', 'actions.dOffline');
    await wait(900);
    await page.locator('.tab', { hasText: 'Помощь' }).click();
    await wait(700);
    await page.locator('.aid-big').first().click();
    await wait(900);
    await page.getByRole('button', { name: 'Запустить метроном' }).click();
    await wait(1600);
  });

  // 7. Компания
  await scene('company', async () => {
    await panel({ n: '7', k: 'Компания', t: 'Не ходите одни', p: 'Попутчики и группы с гидом, проверенные через eGov. Заявка зашифрована, автор принимает её, открывается чат, а контактами делятся только по согласию.', c: ['eGov', 'Шифрование', 'Жалоба и блок'] });
    await mod('./js/core.js', 'actions.dOffline');
    await page.locator('.tab', { hasText: 'Компания' }).click();
    await wait(900);
    const card = page.locator('li.person', { hasText: 'Данияр' });
    await card.scrollIntoViewIfNeeded();
    await wait(400);
    await card.getByRole('button', { name: 'Подать заявку' }).click();
    await wait(900);
    await page.getByRole('button', { name: 'Отправить заявку' }).click();
    await wait(3000);
    await page.getByRole('button', { name: 'Поделиться моим контактом' }).click();
    await wait(2200);
  });

  // 8. Финал
  await scene('outro', async () => {
    await page.screencast.hideActions();
    const logo = await page.evaluate(() => window.__icon('mountain'));
    await card(`<div class="vc-logo">${logo}</div><div class="vc-title">Тау Серік</div><div class="vc-sub">Чтобы горы оставались радостью, а не риском</div>
      <div class="vc-facts"><span>OpenStreetMap и Copernicus DEM</span><span>Прогноз на высоте вершины</span><span>Работает без интернета</span><span>Проверка через eGov</span><span>Шифрование AES-256</span><span>ИИ Gemini</span></div>
      <div class="vc-link">flokko0-0.github.io/tau-serik</div>`, true);
  }, 1200);

  marks.end = Date.now() - t0;
  await page.screencast.stop();
  await page.evaluate(() => clearInterval(window.__sens));
  return JSON.stringify({ marks, errors });
}
