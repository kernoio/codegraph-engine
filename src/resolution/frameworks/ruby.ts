/**
 * Ruby on Rails framework resolver.
 *
 * Route extraction lives in the Kerno rails plugin (`src/plugins/rails/`).
 * This module re-exports that resolver so existing imports keep working; the
 * plugin registry replaces the stock resolver at load time.
 */

export { railsResolver } from '../../plugins/rails/resolver';
