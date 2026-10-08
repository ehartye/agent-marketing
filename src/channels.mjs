import {readFileSync} from 'node:fs';
export const channelLibrary=JSON.parse(readFileSync(new URL('../library/channels.json',import.meta.url)));
export function recommendChannels(project) {
 const audience=project.audience.join(' ').toLowerCase();return channelLibrary.map(c=>{
  const category=c.categories.includes(project.category),fit=c.audiences.some(a=>audience.includes(a)),available=c.hours<=project.weeklyHours;
  return {...c,planningScore:(category?3:0)+(fit?2:0)+(available?1:-2),rationale:[category?'Format suits the project category':'Category fit needs evidence',fit?'Audience description matches a channel cue':'Verify that your intended people are present',available?`Fits ${project.weeklyHours} hours/week`:`Needs about ${c.hours} hours/test; exceeds current weekly capacity`],scoreMeaning:'House planning heuristic, not a reach or conversion forecast; verify policies when using the plan'};
 }).toSorted((a,b)=>b.planningScore-a.planningScore);
}
