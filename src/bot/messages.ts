/**
 * ALL user-facing strings. Russian only, polite "вы". Never inline a Russian
 * string in a handler — add it here. Bodies delivered via the Notifier are
 * plain text with emoji for emphasis (no `parse_mode`, ADR 002).
 *
 * Skeleton: copy is intentionally minimal and will be expanded as commands are
 * built. The structure (one section per command + a shared `common` block) is
 * the contract to keep.
 */

import type { TipSource } from '../content/types';
import { versionAnnouncements } from './messages/version-announcements';

/** The informational disclaimer. Surfaced in /start, /help, and herb pages. */
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
      'Здравствуйте! Это справочник по китайской и тибетской традиционной медицине ' +
      'с напоминаниями и подписками.\n\n' +
      'Пользуйтесь меню внизу экрана или командами через «/».\n\n' +
      disclaimer,
    /** Onboarding step 1: welcome + disclaimer, then the daily-tip offer. */
    onboardingIntro:
      'Здравствуйте! Это справочник по китайской и тибетской традиционной медицине ' +
      'с напоминаниями и подписками.\n\n' +
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
      '• /browse — список трав по традициям и категориям\n' +
      '• /search — поиск травы по названию\n' +
      '• /tips — совет дня\n' +
      '• /reminders — ваши напоминания (создать, посмотреть, отключить)\n' +
      '• /subscriptions — подписки на темы и ежедневный совет\n' +
      '• /settings — настройки\n' +
      '• /donate — поддержать проект\n' +
      '• /feedback — написать разработчику\n\n' +
      disclaimer,
  },

  settings: {
    title: '⚙️ Настройки',
    body: 'Управляйте уведомлениями и поддержкой проекта.',
    /** Read-only bot timezone line; per-user timezones are a later plan. */
    timezone: (tz: string): string => `🕔 Часовой пояс напоминаний: ${tz}`,
    tipLabelOn: 'Совет дня: вкл ✅',
    tipLabelOff: 'Совет дня: выкл 🔕',
    subscriptionsButton: '📂 Подписки',
    donateButton: '⭐️ Поддержать',
    feedbackButton: '✉️ Обратная связь',
    confirmTipOn: '✓ Ежедневный совет включён.',
    confirmTipOff: '✓ Ежедневный совет выключен.',
    closed: 'Меню внизу экрана открывает разделы.',
  },

  browse: {
    title: 'Травы',
    empty: 'Пока нет доступных трав.',
    chinese: '🇨🇳 Китайская',
    tibetan: '🏔 Тибетская',
  },

  search: {
    prompt: 'Введите название травы для поиска:',
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
  },

  subscriptions: {
    title: 'Подписки',
    empty: 'У вас пока нет подписок.',
    subscribed: 'Вы подписались.',
    unsubscribed: 'Вы отписались.',
  },

  donate: {
    intro: 'Поддержать проект можно добровольным донатом в Telegram Stars. Спасибо! 🙏',
    thanks: 'Спасибо за поддержку! ⭐️',
  },

  feedback: {
    prompt: 'Напишите ваше сообщение разработчику одним сообщением:',
    sent: 'Спасибо! Сообщение отправлено.',
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
  },

  notify: {
    /** Inline-button label for the herb cross-link CTA attached to a notification. */
    openCta: '📖 Открыть',
  },

  /**
   * Per-version "what's new" announcement strings (plan 010). Authored in
   * `messages/version-announcements.ts`; re-exported here so the public surface
   * stays `messages.versionAnnouncements`.
   */
  versionAnnouncements,
} as const;
