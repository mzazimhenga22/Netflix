export interface Subtitle {
  start: number;
  end: number;
  text: string;
}

function parseTime(timeStr: string): number {
  const timeStrClean = timeStr.replace(',', '.');
  const parts = timeStrClean.split(':');
  let seconds = 0;
  if (parts.length === 3) {
    seconds += parseInt(parts[0], 10) * 3600;
    seconds += parseInt(parts[1], 10) * 60;
    seconds += parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds += parseInt(parts[0], 10) * 60;
    seconds += parseFloat(parts[1]);
  }
  return seconds;
}

export function parseVtt(content: string): Subtitle[] {
  const lines = content.split(/\r?\n/);
  const subtitles: Subtitle[] = [];
  let currentSub: Partial<Subtitle> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.toUpperCase() === 'WEBVTT') continue;

    if (line.includes('-->')) {
      const times = line.split('-->');
      currentSub = {
        start: parseTime(times[0].trim()),
        end: parseTime(times[1].trim()),
        text: ''
      };
      subtitles.push(currentSub as Subtitle);
    } else if (currentSub) {
      // It's text
      const cleanLine = line.replace(/<[^>]+>/g, ''); // strip inline tags
      if (currentSub.text) {
        currentSub.text += '\n' + cleanLine;
      } else {
        currentSub.text = cleanLine;
      }
    } else {
      // Might be an index number or metadata, ignore
    }
  }
  return subtitles;
}
