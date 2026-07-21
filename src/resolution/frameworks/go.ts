/**
 * Go Framework Resolver
 *
 * Route extraction and gorilla/mux prefix merging live in the Kerno go-http
 * plugin (`src/plugins/go-http/`). This module re-exports that resolver so
 * existing imports keep working; the plugin registry replaces the stock
 * resolver at load time.
 */

export { goHttpResolver as goResolver } from '../../plugins/go-http/resolver';
