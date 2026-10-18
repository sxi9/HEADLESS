/**
 * Every control the driver taps lives here, so when Instagram changes its phone
 * layout there is one file to update.
 *
 * A "spec" is one of:
 *   - a CSS selector string            'svg[aria-label="New post"]'
 *   - { role, name, exact }            accessible role + name (string or RegExp)
 *   - { text, exact }                  visible text
 *   - { label, exact }                 aria-label / <label> text
 * Lists are tried in order; the first visible match wins.
 */
export const SEL = {
  login: {
    username: 'input[name="username"]',
    password: 'input[name="password"]',
    submit: [{ role: 'button', name: /^log in$/i }, 'button[type="submit"]'],
    // The logged-out phone landing page shows a "Log in" button instead of the form.
    openLogin: [
      { role: 'button', name: /^log in$/i },
      { role: 'link', name: /^log in$/i },
    ],
    twoFactorInput: 'input[name="verificationCode"]',
    twoFactorSubmit: [{ role: 'button', name: /^(confirm|verify|submit|next)$/i }],
    errorBox: '#slfErrorAlert, p[data-testid="login-error-message"]',
    errorText:
      /(Sorry, your password was incorrect[^\n]*|The username you entered doesn't belong to an account[^\n]*|There was a problem logging you in[^\n]*|Please wait a few minutes before you try again[^\n]*|Suspicious login attempt[^\n]*)/i,
  },

  dialogs: {
    // Buttons that close cookie banners, "Save your login info?", "Turn on notifications", etc.
    dismiss: ['Decline optional cookies', 'Only allow essential cookies', 'Allow all cookies', 'Not now', 'Not Now'],
  },

  post: {
    // The "+" in the phone app's bottom bar.
    open: [
      'svg[aria-label="New post"]',
      'a[href="/create/style/"]',
      'a[href="/create/select/"]',
      { role: 'link', name: /^(new post|create)$/i },
      { role: 'button', name: /^(new post|create)$/i },
      'svg[aria-label="Create"]',
    ],
    selectFromDevice: [{ role: 'button', name: /select from (computer|device|gallery)/i }],
    next: [
      { role: 'button', name: /^next$/i },
      { text: /^next$/i, exact: true },
    ],
    caption: [
      'textarea[aria-label*="caption" i]',
      '[role="textbox"][aria-label*="caption" i]',
      'div[contenteditable="true"][aria-label*="caption" i]',
      'textarea[placeholder*="caption" i]',
    ],
    share: [
      { role: 'button', name: /^share$/i },
      { text: /^share$/i, exact: true },
    ],
    shared: [{ text: /has been shared/i }, { role: 'heading', name: /^(post|reel) shared$/i }, { text: /^(post|reel) shared$/i }],

    likeIcon: ['article svg[aria-label="Like"]', 'svg[aria-label="Like"]'],
    unlikeIcon: ['article svg[aria-label="Unlike"]', 'svg[aria-label="Unlike"]'],
    commentIcon: ['article svg[aria-label="Comment"]', 'svg[aria-label="Comment"]'],
    commentBox: [
      'textarea[aria-label*="comment" i]',
      '[role="textbox"][aria-label*="comment" i]',
      'textarea[placeholder*="comment" i]',
      'div[contenteditable="true"][aria-label*="comment" i]',
    ],
    commentSubmit: [
      { role: 'button', name: /^post$/i },
      { text: /^post$/i, exact: true },
    ],
  },

  story: {
    // "Your story +" in the tray or the camera icon at the top of the feed.
    open: [
      'svg[aria-label="New story"]',
      '[aria-label="New story"]',
      'a[href="/create/story/"]',
      'svg[aria-label="Add to your story"]',
      { role: 'button', name: /^(new story|add to your story|add to story|your story)$/i },
      { role: 'link', name: /^(new story|add to your story|create story)$/i },
      'svg[aria-label="Camera"]',
    ],
    openFallback: [
      { role: 'button', name: /select from (computer|device|gallery)|upload|choose/i },
      { text: /select from (computer|device|gallery)/i },
    ],
    share: [
      { role: 'button', name: /^(add to your story|add to story|share to story|share to your story|your story|share|add)$/i },
      { text: /^(add to your story|add to story|share to story)$/i },
    ],
    shared: [{ text: /story (was )?(shared|added|posted)|added to your story/i }],
  },

  note: {
    // The "Your note" bubble at the top of the inbox.
    open: [
      { role: 'button', name: /^(your note|leave a note|add a note|new note|note\.\.\.|note…)$/i },
      { text: /^(your note|leave a note|add a note|new note|note\.\.\.|note…)$/i },
      '[aria-label="Your note"]',
      '[aria-label="New note"]',
      '[aria-label="Leave a note"]',
      '[aria-label*="note" i]',
    ],
    // Shown when a note already exists.
    newNote: [
      { role: 'button', name: /^(leave a new note|new note|replace note|edit note)$/i },
      { text: /^(leave a new note|new note)$/i },
    ],
    input: [
      'textarea[placeholder*="thought" i]',
      '[role="textbox"][aria-label*="note" i]',
      'textarea[aria-label*="note" i]',
      'div[contenteditable="true"][aria-label*="thought" i]',
      'div[contenteditable="true"][aria-label*="note" i]',
      'input[placeholder*="thought" i]',
      '[role="dialog"] textarea',
      '[role="dialog"] [contenteditable="true"]',
    ],
    audience: {
      followers: [{ role: 'button', name: /followers you follow back/i }, { text: /followers you follow back/i }],
      close_friends: [{ role: 'button', name: /^close friends$/i }, { text: /^close friends$/i }],
    },
    share: [
      { role: 'button', name: /^(share|post|done)$/i },
      { text: /^share$/i, exact: true },
    ],
  },

  profile: {
    follow: [{ role: 'button', name: /^follow( back)?$/i }],
    following: [{ role: 'button', name: /^(following|requested)$/i }],
    unfollowConfirm: [
      { role: 'button', name: /^unfollow$/i },
      { text: /^unfollow$/i, exact: true },
    ],
    message: [
      { role: 'button', name: /^message$/i },
      { role: 'link', name: /^message$/i },
      { text: /^message$/i, exact: true },
    ],
    notAvailable: /Sorry, this page isn't available/i,
    isPrivate: /This account is private/i,
  },

  dm: {
    input: [
      'textarea[placeholder*="message" i]',
      '[role="textbox"][aria-label*="message" i]',
      'div[contenteditable="true"][aria-label*="message" i]',
      'textarea[aria-label*="message" i]',
    ],
    send: [
      { role: 'button', name: /^send$/i },
      { text: /^send$/i, exact: true },
    ],
  },
};
