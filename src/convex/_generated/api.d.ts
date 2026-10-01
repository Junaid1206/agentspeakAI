/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_llm from "../agent/llm.js";
import type * as agent_orchestrator from "../agent/orchestrator.js";
import type * as agent_rules from "../agent/rules.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as billing from "../billing.js";
import type * as billingInternals from "../billingInternals.js";
import type * as calling_providers from "../calling/providers.js";
import type * as calls from "../calls.js";
import type * as callsInternals from "../callsInternals.js";
import type * as campaigns from "../campaigns.js";
import type * as comments from "../comments.js";
import type * as config from "../config.js";
import type * as customers from "../customers.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as knowledge from "../knowledge.js";
import type * as lib_validation from "../lib/validation.js";
import type * as scheduling from "../scheduling.js";
import type * as users from "../users.js";
import type * as userProfiles from "../userProfiles.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/llm": typeof agent_llm;
  "agent/orchestrator": typeof agent_orchestrator;
  "agent/rules": typeof agent_rules;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  billing: typeof billing;
  billingInternals: typeof billingInternals;
  "calling/providers": typeof calling_providers;
  calls: typeof calls;
  callsInternals: typeof callsInternals;
  campaigns: typeof campaigns;
  comments: typeof comments;
  config: typeof config;
  customers: typeof customers;
  dashboard: typeof dashboard;
  http: typeof http;
  knowledge: typeof knowledge;
  "lib/validation": typeof lib_validation;
  scheduling: typeof scheduling;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
