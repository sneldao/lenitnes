import { permanentRedirect } from 'next/navigation';

// /science was the public label for this vertical until the
// markets/research naming landed. Keep old links working.
export const metadata = {
  title: 'LENITNES Research — scientific software integrity',
};

export default function ScienceRedirect() {
  permanentRedirect('/research');
}
