import { redirect } from 'next/navigation';

// The long-form calibration content (conviction bands, by-detector, repo
// responsiveness, forward paper log, learning notes) now lives on the
// scorecard behind collapsible sections. This route stays as a redirect
// so old links and bookmarks don't 404.
export default function CalibrationPage() {
  redirect('/scorecard');
}
