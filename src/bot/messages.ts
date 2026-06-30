/**
 * ALL user-facing strings. Russian only, polite "вы". Never inline a Russian
 * string in a handler — add it here. Bodies delivered via the Notifier are
 * plain text with emoji for emphasis (no `parse_mode`, ADR 002).
 *
 * Skeleton: copy is intentionally minimal and will be expanded as commands are
 * built. The structure (one section per command + a shared `common` block) is
 * the contract to keep.
 */

import type { Effect, Food, FoodGroup, TipSource } from '../content/types';
import { changelogMessages, versionAnnouncements } from './messages/version-announcements';

/**
 * The informational disclaimer. Scoped (2026-06-29, amends ADR 006 #2/#4) to the
 * formula (составы) card + /start + /help only — it no longer trails every
 * ingredient/food/guide page. Showing it once on entry and on the clinically
 * sensitive formula surface is enough.
 */
const disclaimer =
  '⚠️ Бот носит образовательный характер и не даёт медицинских рекомендаций, ' +
  'диагнозов или назначений. Перед применением любых средств проконсультируйтесь с врачом.';

/** Formats a tip's source citation as one line, omitting any absent parts. */
const formatTipSource = (source: TipSource): string => {
  const parts = [`«${source.work}»`, source.part, source.chapter].filter(
    (part): part is string => part !== undefined,
  );
  return `Источник: ${parts.join(', ')}`;
};

/** Russian display names for the food groups (ADR 012), in catalogue order. */
const FOOD_GROUP_NAMES: Record<FoodGroup, string> = {
  grain: 'Зерновые',
  legume: 'Бобовые',
  oil: 'Масла',
  meat: 'Мясо',
  egg: 'Яйца',
  dairy: 'Молочное',
  'root-vegetable': 'Корнеплоды',
  'green-vegetable': 'Зелень и овощи',
  fruit: 'Фрукты',
  berry: 'Ягоды',
};

/** How a per-начало effect reads on a food card. */
const FOOD_EFFECT_LABELS: Record<Effect, string> = {
  pacifies: 'успокаивает',
  neutral: 'нейтрально',
  aggravates: 'возбуждает',
};

/**
 * Builds the plain-text food card (ADR 002): warmth (+ heaviness), tastes, the
 * three начала with their effect — glossed Желчь (Огонь) / Слизь (Земля-Вода)
 * once — the descriptive effect prose, cautions, and source. No render-time
 * disclaimer (scoped to the formula card + /start + /help as of 2026-06-29,
 * amends ADR 006 #2/#4). Food properties, never a prescription.
 */
const formatFoodCard = (food: Food): string => {
  const facets: string[] = [`🥗 ${food.nameRu}`, ''];
  facets.push(
    `Природа: ${food.heaviness !== undefined ? `${food.warmth}, ${food.heaviness}` : food.warmth}`,
  );
  if (food.tastes.length > 0) facets.push(`Вкус: ${food.tastes.join(', ')}`);
  facets.push(
    'Влияние на начала:',
    `• Ветер — ${FOOD_EFFECT_LABELS[food.constitutions.wind]}`,
    `• Желчь (Огонь) — ${FOOD_EFFECT_LABELS[food.constitutions.bile]}`,
    `• Слизь (Земля-Вода) — ${FOOD_EFFECT_LABELS[food.constitutions.phlegm]}`,
  );
  const parts = [facets.join('\n'), food.effect];
  if (food.cautions !== undefined && food.cautions.length > 0) {
    parts.push(['Предостережения:', ...food.cautions.map((c) => `• ${c}`)].join('\n'));
  }
  if (food.source !== undefined) parts.push(formatTipSource(food.source));
  return parts.join('\n\n');
};

export const messages = {
  disclaimer,

  common: {
    notRegistered: 'Пожалуйста, отправьте /start, чтобы начать.',
    error: 'Что-то пошло не так. Попробуйте ещё раз позже.',
    sessionExpired: 'Сессия истекла. Откройте раздел заново.',
    cancelled: 'Отменено.',
    rateLimited: 'Слишком много запросов. Подождите немного.',
    notImplemented: 'Этот раздел ещё в разработке.',
  },

  /**
   * Persistent reply-keyboard menu (ADR 009). Labels double as the exact-match
   * triggers in `menu-router.ts`, so they must stay stable and unique. `nav.*`
   * are the inline back/home/pager affordances reused across drilldown screens.
   */
  menu: {
    library: '📚 Библиотека',
    reminders: '⏰ Напоминания',
    tips: '💡 Советы',
    settings: '⚙️ Настройки',
    help: '❓ Помощь',
  },

  nav: {
    back: '« Назад',
    home: '🏠 В меню',
    prev: '◀',
    next: '▶',
    /** Position indicator for the pager, e.g. "2 / 7". */
    position: (index: number, count: number): string => `${index + 1} / ${count}`,
  },

  start: {
    welcome:
      'Здравствуйте! Это справочник по тибетской традиционной медицине ' +
      'с напоминаниями и ежедневными советами.\n\n' +
      'Пользуйтесь меню внизу экрана или командами через «/».\n\n' +
      disclaimer,
    /** Onboarding step 1: welcome + disclaimer, then the daily-tip offer. */
    onboardingIntro:
      'Здравствуйте! Это справочник по тибетской традиционной медицине ' +
      'с напоминаниями и ежедневными советами.\n\n' +
      disclaimer +
      '\n\nХотите получать ежедневный совет дня?',
    tipYes: '🔔 Да, присылайте',
    tipNo: '🔕 Нет, спасибо',
    tipOnConfirm: '✓ Ежедневный совет включён. Изменить можно в ⚙️ Настройках.',
    tipOffConfirm: '✓ Совет дня выключен. Включить можно в ⚙️ Настройках.',
    done:
      'Готово! Меню внизу экрана открывает разделы: 📚 Библиотека, ⏰ Напоминания, ' +
      '💡 Советы, ⚙️ Настройки. Начните с 📚 Библиотеки.',
    welcomeBack: 'С возвращением! Выберите раздел в меню внизу экрана.',
  },

  help: {
    body:
      'Меню внизу экрана открывает основные разделы: 📚 Библиотека, ⏰ Напоминания, ' +
      '💡 Советы, ⚙️ Настройки, ❓ Помощь.\n\n' +
      'Команды:\n' +
      '• /browse — список ингредиентов: все или по категориям\n' +
      '• /search — поиск по названию\n' +
      '• /guides — статьи и руководства\n' +
      '• /foods — продукты: природа, вкус и для кого они подходят\n' +
      '• /tips — совет дня\n' +
      '• /reminders — ваши напоминания (создать, посмотреть, отключить)\n' +
      '• /settings — настройки\n' +
      '• /changelog — история обновлений бота\n' +
      '• /sources — об источниках справочника\n' +
      '• /donate — поддержать проект\n' +
      '• /feedback — написать разработчику\n\n' +
      disclaimer,
    /** Version footer line appended to /help; filled with getVersion() at render time. */
    version: (v: string): string => `Версия ${v}`,
  },

  settings: {
    title: '⚙️ Настройки',
    body: 'Управляйте уведомлениями и поддержкой проекта.',
    /** Read-only bot timezone line; per-user timezones are a later plan. */
    timezone: (tz: string): string => `🕔 Часовой пояс напоминаний: ${tz}`,
    tipLabelOn: 'Совет дня: вкл ✅',
    tipLabelOff: 'Совет дня: выкл 🔕',
    announcementsLabelOn: 'Новые функции: вкл ✅',
    announcementsLabelOff: 'Новые функции: выкл 🔕',
    donateButton: '⭐️ Поддержать',
    feedbackButton: '✉️ Обратная связь',
    confirmTipOn: '✓ Ежедневный совет включён.',
    confirmTipOff: '✓ Ежедневный совет выключен.',
    confirmAnnouncementsOn: '✓ Уведомления о новых функциях включены.',
    confirmAnnouncementsOff: '✓ Уведомления о новых функциях выключены.',
    closed: 'Меню внизу экрана открывает разделы.',
  },

  browse: {
    title: 'Ингредиенты',
    empty: 'Пока нет доступных ингредиентов.',
    tibetan: '🏔 Тибетская',
  },

  /**
   * Unified library surface (Plan 009). The hub gathers every reference branch
   * under one roof; branches whose owning plan hasn't shipped (guides) or that
   * are held behind the ADR 006 doctor-gate (formulas) are simply not rendered.
   */
  library: {
    title: '📚 Библиотека',
    intro: 'Выберите раздел.',
    herbs: '🌿 Ингредиенты',
    guides: '📖 Статьи',
    tips: '💡 Случайный совет',
    search: '🔎 Поиск',
    formulas: '🧪 Составы',
    foods: '🥗 Продукты',
    // 🌿 Ингредиенты branch (display label only — code/ids/callbacks keep the
    // "herb" vocabulary, mirroring the Plan 017 «Составы» split).
    herbsTitle: 'Ингредиенты — выберите способ просмотра.',
    allHerbs: 'Все ингредиенты',
    byCategory: 'По категории',
    pickCategory: 'Выберите категорию.',
    emptyHerbs: 'Пока нет доступных ингредиентов.',
    emptyCategories: 'Пока нет категорий с ингредиентами.',
    /** Category button: name + how many herbs it groups. */
    categoryButton: (name: string, count: number): string => `${name} (${count})`,
    // 💡 Случайный совет branch (on-demand random tip, Plan 021)
    tipsEmpty: 'Пока нет советов.',
    // 📖 Статьи branch (long-form guides, Plan 006)
    guidesTitle: 'Статьи — выберите, что почитать.',
    guidesEmpty: 'Пока нет статей.',
    // 🧪 Составы branch (live post the ADR 006 doctor-gate sign-off). The label
    // is «Составы»; code/ids/callbacks keep the "formula/combination" vocabulary.
    formulasTitle: 'Составы',
    formulasEmpty: 'Пока нет составов.',
    /** 🔎 button at the top of the formula list — opens the formula-only search. */
    formulasSearch: '🔎 Поиск по составам',
  },

  /**
   * 🥗 Продукты — the foods browse + filter branch (Plan 013, ADR 012). Groups
   * are listed with counts; the filter screen narrows by which начало a food
   * успокаивает or by its warmth band. The card itself is built by `card`
   * (`formatFoodCard`); it carries no render-time disclaimer (scoped to the
   * formula card + /start + /help, 2026-06-29).
   */
  foods: {
    groupsTitle: 'Продукты — выберите раздел или подберите по свойствам.',
    /** Top-of-list button on the groups screen, opening the filter screen. A
     *  non-magnifier glyph so it reads as a pick-list, not the 🔎 text search. */
    filterEntry: '🎯 Подобрать по свойствам',
    filterTitle: 'Выберите начало, которое нужно успокоить, или природу продукта.',
    emptyGroups: 'Пока нет продуктов.',
    emptyList: 'Подходящих продуктов не найдено.',
    /** Group button: Russian group name + how many foods it holds. */
    groupButton: (group: FoodGroup, count: number): string =>
      `${FOOD_GROUP_NAMES[group]} (${count})`,
    /** Title of a single group's food list. */
    groupTitle: (group: FoodGroup): string => FOOD_GROUP_NAMES[group],
    // Filter buttons double as the resulting list titles for the constitution bands.
    filterWind: 'Успокаивают Ветер',
    filterBile: 'Успокаивают Желчь (Огонь)',
    filterPhlegm: 'Успокаивают Слизь (Земля-Вода)',
    filterWarm: 'Тёплые',
    filterCool: 'Прохладные',
    warmTitle: 'Тёплые продукты',
    coolTitle: 'Прохладные продукты',
    /** Plain-text food card (ADR 002); no render-time disclaimer (2026-06-29). */
    card: formatFoodCard,
  },

  /**
   * Formula (combination) card section labels (Plan 009 Phase 5; rich-text
   * rendering Plan 014 / ADR 011). The card is live post the ADR 006 owner
   * sign-off and, in addition to the minimal field set (composition, member
   * cross-links, a descriptive line, cautions), surfaces the structured verbose
   * fields — indications, traditional use and dosing — as a live-review surface
   * (owner sign-off 2026-06-29, pending final review before large production).
   * The raw `sourceText`/`body` stay unsurfaced.
   *
   * These are **plain-text labels only** — the emphasis tags (`<b>`, blockquote,
   * etc.) live in the static parts of the `html` template in `_formula-card.ts`,
   * so a label interpolated through the template is escaped harmlessly. Never
   * put HTML markup in these strings.
   */
  formulaCard: {
    composition: 'Состав',
    indications: 'Показания',
    use: 'Применение',
    dosing: 'Приём',
    cautions: 'Предостережения',
  },

  /** Shared herb-card chrome (the card body itself is content + disclaimer). */
  herbCard: {
    /** Header for the reverse cross-link section; formula names sit on buttons. */
    inFormulas: 'Входит в составы:',
    /** Variant when the herb belongs to more formulas than the keyboard shows. */
    inFormulasCapped: (shown: number, total: number): string =>
      `Входит в составы (показаны ${shown} из ${total}):`,
  },

  search: {
    prompt: 'Введите название травы для поиска:',
    /** Prompt for the formula-only search reached from the formula list (Plan 017). */
    formulaPrompt: 'Введите название состава для поиска:',
    nothingFound: 'Ничего не найдено. Попробуйте другое название.',
    results: 'Результаты поиска',
  },

  tips: {
    empty: 'Пока нет советов.',
  },

  reminders: {
    title: 'Ваши напоминания',
    empty: 'У вас пока нет напоминаний. Создайте первое.',
    created: 'Напоминание создано.',
    cancelled: 'Напоминание отключено.',
    newButton: '➕ Новое',
    /** Title of the per-reminder detail screen (Plan 024). */
    detailTitle: 'Напоминание',
    /** Delete button on the detail screen — immediate, no confirm (Plan 024). */
    deleteButton: '🗑 Удалить',
    /** Next-fire line under the list title. */
    nextFire: (whenText: string): string => `Ближайшее: ${whenText}`,
  },

  /**
   * Create-reminder wizard (Plan 008). One anchor message, edited per step.
   * Button labels stay short; copy is polite "вы". Error strings are surfaced as
   * `answerCbQuery` toasts, so they must be ≤200 chars.
   */
  reminderCreate: {
    // step: label
    labelPromptFree: 'Введите текст напоминания одним сообщением — например, «Выпить тёплую воду».',
    labelPromptHerb: (name: string): string =>
      `Напоминание о траве «${name}». Оставить это название или ввести своё?`,
    labelCurrent: (label: string): string => `Текущий текст: «${label}»`,
    useHerbName: '✅ Оставить название',
    enterCustom: '✏️ Ввести своё',
    labelTooLong: (max: number): string => `Слишком длинно — сократите до ${max} символов.`,
    // step: link (optional) — type picker → ingredient / formula browser
    linkPrompt: 'Привязать к напоминанию ингредиент или состав?',
    linkHerb: '🌿 Ингредиент',
    linkFormula: '🧪 Состав',
    herbPrompt: 'Выберите ингредиент из списка.',
    formulaPrompt: 'Выберите состав из списка.',
    herbSkip: '⏭ Пропустить',
    /** Linked-ingredient line on the confirm / detail screens. */
    herbLine: (name: string): string => `🌿 Ингредиент: ${name}`,
    /** Linked-formula line on the confirm / detail screens. */
    formulaLine: (name: string): string => `🧪 Состав: ${name}`,
    // step: intake (formula-only) — how the состав is taken
    intakePrompt: 'Как принимать состав?',
    intakePlain: '💧 С тёплой водой',
    intakeDecoction: '🍵 Отвар',
    /** Display names of the intake type — used to build `intakeLine`. */
    intakePlainLabel: 'с тёплой водой',
    intakeDecoctionLabel: 'отвар',
    /** Intake-type line on the confirm / detail screens + the fired notification. */
    intakeLine: (label: string): string => `🍶 Приём: ${label}`,
    // step: kind
    kindPrompt: (label: string): string => `«${label}»\n\nКак часто напоминать?`,
    kindOnce: 'Один раз',
    kindDaily: 'Каждый день',
    kindWeekly: 'По дням недели',
    kindInterval: 'Каждые N дней',
    // step: every (interval)
    everyPrompt: 'Каждые сколько дней напоминать?',
    everyLabel: (n: number): string => `${n} дн.`,
    // step: time (single time per reminder — tap to pick, then «Далее»)
    timePrompt: 'Выберите час. Минуты — переключатель :00 / :30. Затем «Далее».',
    /** Minute-mode toggle buttons above the hour grid. */
    minute00: ':00',
    minute30: ':30',
    /** Echoes the chosen single time under the grid. */
    selectedTime: (t: string): string => `Выбрано: ${t}`,
    // step: date (once)
    datePrompt: 'В какой день напомнить?',
    dateToday: 'Сегодня',
    dateTomorrow: 'Завтра',
    // step: weekdays (weekly)
    weekdaysPrompt: 'В какие дни недели? Затем «Далее».',
    /** Weekday button labels, indexed 0=Вс … 6=Сб (matches RecurrenceSpec). */
    weekdayShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const,
    // step: confirm
    confirmPrompt: 'Проверьте напоминание:',
    summary: (label: string, recurrence: string, tz: string): string =>
      `«${label}»\n${recurrence}\n\n🕔 Часовой пояс: ${tz}`,
    // shared chrome
    next: 'Далее ▶',
    save: '💾 Сохранить',
    cancel: '✖️ Отмена',
    // outcomes
    saved: (whenText: string): string => `✓ Напоминание создано. Ближайшее: ${whenText}.`,
    cancelled: 'Создание отменено.',
    // validation toasts
    needTime: 'Выберите время.',
    needWeekday: 'Выберите хотя бы один день недели.',
    pastOnce: 'Это время уже прошло. Выберите другой день или время.',
    // human-readable recurrence (reused by the reminders list)
    describeOnce: (whenText: string): string => `Один раз — ${whenText}`,
    describeDaily: (times: string): string => `Каждый день в ${times}`,
    describeWeekly: (days: string, times: string): string => `По дням: ${days}, в ${times}`,
    describeInterval: (n: number, times: string): string => `Каждые ${n} дн. в ${times}`,
  },

  donate: {
    intro: 'Поддержать проект можно добровольным донатом в Telegram Stars. Спасибо! 🙏',
    thanks: 'Спасибо за поддержку! ⭐️',
  },

  feedback: {
    prompt: 'Напишите ваше сообщение разработчику одним сообщением:',
    sent: 'Спасибо! Сообщение отправлено.',
    /** Admin-facing relay of a user's feedback. `userId` is the internal id. */
    adminRelay: (userId: number, text: string): string =>
      `✉️ Обратная связь от пользователя #${userId}:\n\n${text}`,
  },

  // ─── notification bodies (delivered via the Notifier) ───────────────────────

  reminder: {
    /** Body of a fired user-scheduled reminder. */
    body: (label: string): string => `⏰ Напоминание: ${label}`,
  },

  tip: {
    /** Wraps a daily-tip body pulled from content, with an optional source line. */
    daily: (body: string, source?: TipSource): string =>
      source !== undefined
        ? `🌿 Совет дня\n\n${body}\n\n${formatTipSource(source)}`
        : `🌿 Совет дня\n\n${body}`,
    /**
     * On-demand variant (Plan 021): the menu / `/tips` / library leaf serve a
     * *random* tip per tap, so the "дня" wording would be false here.
     */
    random: (body: string, source?: TipSource): string =>
      source !== undefined
        ? `🌿 Совет\n\n${body}\n\n${formatTipSource(source)}`
        : `🌿 Совет\n\n${body}`,
  },

  /**
   * /sources — short «Об источниках» page. Names the texts the corpus draws on
   * (Чжуд-ши, Сова Ригпа, manla.ru for составы). Plain-text reply (ADR 002),
   * listed in /help. Kept factual and descriptive — no disclaimer trailer
   * (scoped to the formula card + /start + /help, 2026-06-29).
   */
  sources: {
    body:
      '📚 Об источниках\n\n' +
      'Материалы справочника опираются на тибетские медицинские тексты:\n\n' +
      '• «Чжуд-ши» — коренной трактат тибетской медицины. Основа разделов ' +
      'о вкусах, природах, питании и образе жизни.\n' +
      '• «Сова Ригпа. Наука о здоровье» — современное изложение тибетской ' +
      'медицины; источник статей о продуктах и сезонном питании.\n' +
      '• manla.ru — составы (рецептуры) и их компоненты.\n\n' +
      'Справочник передаёт, как описанные средства и продукты традиционно ' +
      'применялись в этой традиции.',
  },

  notify: {
    /** Inline-button label for the herb cross-link CTA attached to a notification. */
    openCta: '📖 Открыть',
  },

  /**
   * Per-version "what's new" announcement strings + the /changelog renderer
   * (plan 010). Authored in `messages/version-announcements.ts`; re-exported
   * here so the public surface stays `messages.versionAnnouncements` and
   * `messages.changelog`.
   */
  versionAnnouncements,
  changelog: changelogMessages,
} as const;
