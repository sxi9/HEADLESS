/** Base class for every error this library raises on purpose. */
export class InstagramError extends Error {
  constructor(message, { code = 'INSTAGRAM_ERROR', cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = new.target.name;
    this.code = code;
  }
}

export class RateLimitedError extends InstagramError {
  constructor(url) {
    super(
      `Instagram answered 429 Too Many Requests for ${url}. Wait a while before retrying, and reuse the saved session instead of logging in again.`,
      { code: 'RATE_LIMITED' },
    );
  }
}

export class LoginError extends InstagramError {
  constructor(message, options = {}) {
    super(message, { code: 'LOGIN_FAILED', ...options });
  }
}

export class TwoFactorError extends InstagramError {
  constructor(message, options = {}) {
    super(message, { code: 'TWO_FACTOR', ...options });
  }
}

export class ChallengeError extends InstagramError {
  constructor(message, options = {}) {
    super(message, { code: 'CHALLENGE', ...options });
  }
}

export class NotLoggedInError extends InstagramError {
  constructor(message = 'This action needs a logged-in session. Run `ig login` first, or set IG_USERNAME and IG_PASSWORD.', options = {}) {
    super(message, { code: 'NOT_LOGGED_IN', ...options });
  }
}

export class NotFoundError extends InstagramError {
  constructor(message, options = {}) {
    super(message, { code: 'NOT_FOUND', ...options });
  }
}

/** Raised when an expected control is missing: usually Instagram changed its layout. */
export class UiNotFoundError extends InstagramError {
  constructor(message, options = {}) {
    super(
      `${message} Instagram changes its phone layout often; run with --debug, look at the screenshots in debug/, and adjust src/selectors.js.`,
      {
        code: 'UI_NOT_FOUND',
        ...options,
      },
    );
  }
}

export class BadInputError extends InstagramError {
  constructor(message, options = {}) {
    super(message, { code: 'BAD_INPUT', ...options });
  }
}
