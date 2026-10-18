/**
 * API client base configuration.
 * Reads the backend URL from the app's env variable.
 * Real auth token injection and TanStack Query integration in Part 3.
 */

// In Expo, public environment variables are prefixed with EXPO_PUBLIC_
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export const API_BASE_URL = BASE_URL;

/** Build a full API URL from a path segment */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
