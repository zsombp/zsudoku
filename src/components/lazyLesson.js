import { lazy } from 'react'

/**
 * The lesson screen and its engine, as a chunk of their own.
 *
 * They are about thirty-seven kilobytes the app does not need until someone
 * opens a lesson, and they took the main bundle past Vite's 500KB line. The service
 * worker precaches every chunk, so this changes nothing offline: the first
 * lesson opens from the cache like everything else.
 *
 * Screens decide whether to offer a lesson with `canTeach` from
 * logic/teachable.js, which is tiny and stays in the main bundle.
 */
export const Lesson = lazy(() => import('./Lesson.jsx'))
export const lessons = () => import('../logic/lessons.js')
export const moments = () => import('../stats/moments.js')
export const bank = () => import('../logic/lessonBank.js')
