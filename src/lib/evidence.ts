// The reading list behind the Tools tab. Bibliographic data lives here because
// author names, years and DOIs are not translated; the prose (takeaway, finding,
// caveat) lives in the locale files under `learn.e.<id>.*`.
//
// House rule: every source below was checked against the publisher record before
// it shipped, and where a finding is weaker than its popular telling — the
// 10,000 hours story, sleep consolidation, external focus, interleaving, slow
// practice — the entry carries `contested` and says so in its own caveat rather
// than being quietly dropped. An honest reading list includes the replication.

export type EvidenceGroup = 'practice' | 'learning' | 'people';

/** A personal line under an entry, computed from the user's own rows. */
export type StatHook = 'interleaving' | 'spacing' | 'sessionLength';

export type Source = {
  authors: string;
  year: number;
  title: string;
  /** Journal, volume(issue), pages — or publisher and ISBN for a book. */
  where: string;
  url: string;
  /** Free to read at the URL above (or an OA mirror). */
  oa?: boolean;
};

export type Entry = {
  id: string;
  group: EvidenceGroup;
  /** First source is the headline; the rest are the counterweights and follow-ups. */
  sources: Source[];
  /** Shows a "contested" chip; such an entry must carry a caveat string. */
  contested?: boolean;
  /** Entry has a `learn.e.<id>.caveat` string. */
  caveat?: boolean;
  stat?: StatHook;
};

export const GROUPS: EvidenceGroup[] = ['practice', 'learning', 'people'];

export const ENTRIES: Entry[] = [
  // --- how to practise ----------------------------------------------------
  {
    id: 'deliberatePractice',
    group: 'practice',
    contested: true,
    caveat: true,
    sources: [
      {
        authors: 'Ericsson, Krampe & Tesch-Römer',
        year: 1993,
        title: 'The role of deliberate practice in the acquisition of expert performance',
        where: 'Psychological Review, 100(3), 363–406',
        url: 'https://doi.org/10.1037/0033-295X.100.3.363',
      },
      {
        authors: 'Macnamara & Maitra',
        year: 2019,
        title: 'The role of deliberate practice in expert performance: revisiting Ericsson, Krampe & Tesch-Römer (1993)',
        where: 'Royal Society Open Science, 6(8), 190327',
        url: 'https://doi.org/10.1098/rsos.190327',
        oa: true,
      },
      {
        authors: 'Macnamara, Hambrick & Oswald',
        year: 2014,
        title: 'Deliberate practice and performance in music, games, sports, education, and professions: A meta-analysis',
        where: 'Psychological Science, 25(8), 1608–1618 (corrigendum 2018)',
        url: 'https://doi.org/10.1177/0956797614535810',
      },
    ],
  },
  {
    id: 'slowPractice',
    group: 'practice',
    contested: true,
    caveat: true,
    sources: [
      {
        authors: 'Allingham & Wöllner',
        year: 2022,
        title: 'Slow practice and tempo-management strategies in instrumental music learning: Investigating prevalence and cognitive functions',
        where: 'Psychology of Music, 50(6), 1925–1941',
        url: 'https://doi.org/10.1177/03057356211073481',
      },
      {
        authors: 'Pierce',
        year: 1992,
        title: 'The effects of learning procedure, tempo, and performance condition on transfer of rhythm skills in instrumental music',
        where: 'Journal of Research in Music Education, 40(4), 295–305',
        url: 'https://doi.org/10.2307/3345837',
      },
      {
        authors: 'Henley',
        year: 2001,
        title: 'Effects of modeling and tempo patterns as practice techniques on the performance of high school instrumentalists',
        where: 'Journal of Research in Music Education, 49(2), 169–180',
        url: 'https://doi.org/10.2307/3345868',
      },
      {
        authors: 'Duke, Simmons & Cash',
        year: 2009,
        title: "It's not how much; it's how: Characteristics of practice behavior and retention of performance skills",
        where: 'Journal of Research in Music Education, 56(4), 310–321',
        url: 'https://doi.org/10.1177/0022429408328851',
      },
    ],
  },
  {
    id: 'interleaving',
    group: 'practice',
    contested: true,
    caveat: true,
    stat: 'interleaving',
    sources: [
      {
        authors: 'Rohrer & Taylor',
        year: 2007,
        title: 'The shuffling of mathematics problems improves learning',
        where: 'Instructional Science, 35(6), 481–498',
        url: 'https://doi.org/10.1007/s11251-007-9015-8',
        oa: true,
      },
      {
        authors: 'Shea & Morgan',
        year: 1979,
        title: 'Contextual interference effects on the acquisition, retention, and transfer of a motor skill',
        where: 'Journal of Experimental Psychology: Human Learning and Memory, 5(2), 179–187',
        url: 'https://doi.org/10.1037/0278-7393.5.2.179',
      },
      {
        authors: 'Ammar et al.',
        year: 2023,
        title: 'The myth of contextual interference learning benefit in sports practice: A systematic review and meta-analysis',
        where: 'Educational Research Review, 39, 100537',
        url: 'https://doi.org/10.1016/j.edurev.2023.100537',
      },
    ],
  },
  {
    id: 'mentalPractice',
    group: 'practice',
    caveat: true,
    sources: [
      {
        authors: 'Steenstrup et al.',
        year: 2021,
        title: 'Imagine, sing, play — combined mental, vocal and physical practice improves musical performance',
        where: 'Frontiers in Psychology, 12, 757052',
        url: 'https://doi.org/10.3389/fpsyg.2021.757052',
        oa: true,
      },
      {
        authors: 'Toth et al.',
        year: 2020,
        title: 'Does mental practice still enhance performance? A 24 year follow-up and meta-analytic replication and extension',
        where: 'Psychology of Sport and Exercise, 48, 101672',
        url: 'https://doi.org/10.1016/j.psychsport.2020.101672',
      },
      {
        authors: 'Bernardi et al.',
        year: 2013,
        title: 'Mental practice promotes motor anticipation: evidence from skilled music performance',
        where: 'Frontiers in Human Neuroscience, 7, 451',
        url: 'https://doi.org/10.3389/fnhum.2013.00451',
        oa: true,
      },
    ],
  },
  {
    id: 'externalFocus',
    group: 'practice',
    contested: true,
    caveat: true,
    sources: [
      {
        authors: 'Mornell & Wulf',
        year: 2018,
        title: 'Adopting an external focus of attention enhances musical performance',
        where: 'Journal of Research in Music Education, 66(4), 375–391',
        url: 'https://doi.org/10.1177/0022429418801573',
      },
      {
        authors: 'McKay et al.',
        year: 2024,
        title: 'Reporting bias, not external focus: A robust Bayesian meta-analysis and systematic review of the external focus of attention literature',
        where: 'Psychological Bulletin, 150(11), 1347–1362',
        url: 'https://doi.org/10.1037/bul0000451',
        oa: true,
      },
    ],
  },
  {
    id: 'exercise',
    group: 'practice',
    caveat: true,
    sources: [
      {
        authors: 'Wanner, Cheng & Steib',
        year: 2020,
        title: 'Effects of acute cardiovascular exercise on motor memory encoding and consolidation: A systematic review with meta-analysis',
        where: 'Neuroscience & Biobehavioral Reviews, 116, 365–381',
        url: 'https://doi.org/10.1016/j.neubiorev.2020.06.018',
      },
    ],
  },
  {
    id: 'anxiety',
    group: 'practice',
    sources: [
      {
        authors: 'Nicholl & Abbott',
        year: 2025,
        title: 'Treatments for performance anxiety in musicians across the lifespan: A systematic review and meta-analysis',
        where: 'Psychology of Music, 54(4), 617–657',
        url: 'https://doi.org/10.1177/03057356251322655',
      },
    ],
  },
  {
    id: 'injury',
    group: 'practice',
    caveat: true,
    stat: 'sessionLength',
    sources: [
      {
        authors: 'Kok et al.',
        year: 2016,
        title: 'The occurrence of musculoskeletal complaints among professional musicians: a systematic review',
        where: 'International Archives of Occupational and Environmental Health, 89(3), 373–396',
        url: 'https://europepmc.org/articles/PMC4786597',
        oa: true,
      },
    ],
  },

  // --- how learning works -------------------------------------------------
  {
    id: 'spacing',
    group: 'learning',
    caveat: true,
    stat: 'spacing',
    sources: [
      {
        authors: 'Cepeda, Pashler, Vul, Wixted & Rohrer',
        year: 2006,
        title: 'Distributed practice in verbal recall tasks: A review and quantitative synthesis',
        where: 'Psychological Bulletin, 132(3), 354–380',
        url: 'https://escholarship.org/uc/item/3rr6q10c',
        oa: true,
      },
    ],
  },
  {
    id: 'retrieval',
    group: 'learning',
    caveat: true,
    sources: [
      {
        authors: 'Roediger & Karpicke',
        year: 2006,
        title: 'Test-enhanced learning: Taking memory tests improves long-term retention',
        where: 'Psychological Science, 17(3), 249–255',
        url: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
      },
      {
        authors: 'Pan & Rickard',
        year: 2018,
        title: 'Transfer of test-enhanced learning: Meta-analytic review and synthesis',
        where: 'Psychological Bulletin, 144(7), 710–756',
        url: 'https://doi.org/10.1037/bul0000151',
      },
    ],
  },
  {
    id: 'sleep',
    group: 'learning',
    contested: true,
    caveat: true,
    sources: [
      {
        authors: 'Walker et al.',
        year: 2002,
        title: 'Practice with sleep makes perfect: Sleep-dependent motor skill learning',
        where: 'Neuron, 35(1), 205–211',
        url: 'https://doi.org/10.1016/S0896-6273(02)00746-8',
      },
      {
        authors: 'Rickard et al.',
        year: 2008,
        title: 'Sleep does not enhance motor sequence learning',
        where: 'Journal of Experimental Psychology: LMC, 34(4), 834–842',
        url: 'https://doi.org/10.1037/0278-7393.34.4.834',
      },
      {
        authors: 'Pan & Rickard',
        year: 2015,
        title: 'Sleep and motor learning: Is there room for consolidation?',
        where: 'Psychological Bulletin, 141(4), 812–834',
        url: 'https://sc-pan.github.io/pdf/PR_2015.pdf',
        oa: true,
      },
    ],
  },
  {
    id: 'overview',
    group: 'learning',
    sources: [
      {
        authors: 'Dunlosky, Rawson, Marsh, Nathan & Willingham',
        year: 2013,
        title: "Improving students' learning with effective learning techniques: Promising directions from cognitive and educational psychology",
        where: 'Psychological Science in the Public Interest, 14(1), 4–58',
        url: 'https://doi.org/10.1177/1529100612453266',
        oa: true,
      },
    ],
  },

  // --- people worth reading ----------------------------------------------
  {
    id: 'kageyama',
    group: 'people',
    caveat: true,
    sources: [
      {
        authors: 'Noa Kageyama',
        year: 2025,
        title: 'The Bulletproof Musician',
        where: 'Performance psychology · Juilliard faculty',
        url: 'https://bulletproofmusician.com/',
        oa: true,
      },
    ],
  },
  {
    id: 'gebrian',
    group: 'people',
    sources: [
      {
        authors: 'Molly Gebrian',
        year: 2024,
        title: "Learn faster, perform better: A musician's guide to the neuroscience of practicing",
        where: 'Oxford University Press · ISBN 9780197680070',
        url: 'https://www.mollygebrian.com/',
        oa: true,
      },
    ],
  },
  {
    id: 'klickstein',
    group: 'people',
    caveat: true,
    sources: [
      {
        authors: 'Gerald Klickstein',
        year: 2009,
        title: "The musician's way: A guide to practice, performance, and wellness",
        where: 'Oxford University Press · ISBN 9780195343137',
        url: 'https://www.musiciansway.com/',
        oa: true,
      },
    ],
  },
];
