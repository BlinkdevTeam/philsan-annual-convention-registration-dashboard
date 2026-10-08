// Shared by SurveyPage.jsx (participant form) and SurveyResults.jsx (admin).
// Keys in SURVEY_QUESTIONS must match the columns in public.survey_responses.
// Speaker ratings and the Learning Session choice are saved in the
// extra_answers column instead (see survey_speaker_ratings.sql).

export const SURVEY_TITLE = 'Evaluation Form: 39th PHILSAN Annual Convention';
export const SURVEY_INTRO =
  'Thank you for attending our convention! We value your feedback to help us improve future events. Please take a few minutes to complete this evaluation form.';

const RATING = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];

// ── The original 10 questions (unchanged; used by SurveyResults.jsx) ──
export const SURVEY_QUESTIONS = [
  {
    key: 'overall_experience',
    section: 'Overall Experience',
    label: 'How would you rate your overall experience at the convention?',
    type: 'choice',
    options: RATING,
  },
  {
    key: 'content_quality',
    section: 'Content and Relevance',
    label: 'How would you rate the quality and relevance of the topics?',
    type: 'choice',
    options: RATING,
  },
  {
    key: 'content_helpful',
    section: 'Content and Relevance',
    label: 'Was the content helpful and applicable to your needs?',
    type: 'choice',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'venue',
    section: 'Organization and Logistics',
    sectionNote: 'How would you rate the following:',
    label: 'a. Venue',
    type: 'choice',
    options: RATING,
  },
  {
    key: 'registration_process',
    section: 'Organization and Logistics',
    label: 'b. Registration Process',
    type: 'choice',
    options: RATING,
  },
  {
    key: 'time_management',
    section: 'Organization and Logistics',
    label: 'c. Time Management',
    type: 'choice',
    options: RATING,
  },
  {
    key: 'most_valuable',
    section: 'Key Takeaways',
    label: 'What was the most valuable part of the convention for you?',
    type: 'text',
  },
  {
    key: 'improvements',
    section: 'Suggestions for Improvement',
    label: 'What could we do to improve future conventions?',
    type: 'text',
  },
  {
    key: 'recommend',
    section: 'Likelihood to Recommend',
    label: 'How likely are you to recommend this convention to others?',
    type: 'choice',
    options: [
      { value: 'very_likely', label: 'Very Likely' },
      { value: 'likely', label: 'Likely' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'unlikely', label: 'Unlikely' },
    ],
  },
  {
    key: 'additional_comments',
    section: "We'd love to hear your feedback.",
    label: "Do you have any additional comments, suggestions, or feedback you'd like to share?",
    type: 'text',
  },
];

// ── Speaker evaluations (saved in extra_answers) ──
// `showIf: { key, value }` shows a question only when another answer matches.
// Hidden questions are not required and are not saved.

const SCORE_1_TO_5 = ['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }));

const SPEAKER_NOTE =
  'Please rate the speaker on a scale of 1 to 5, where 1 is the lowest and 5 is the highest rating.';

// Two rating questions for one speaker
function speaker(key, sectionTitle, showIf) {
  const section = `Speaker Evaluation - ${sectionTitle}`;
  return [
    {
      key: `${key}_knowledge`,
      section,
      sectionNote: SPEAKER_NOTE,
      label: "Speaker's knowledge of the topic",
      type: 'choice',
      options: SCORE_1_TO_5,
      ...(showIf && { showIf }),
    },
    {
      key: `${key}_delivery`,
      section,
      label: "Speaker's presentation and delivery",
      type: 'choice',
      options: SCORE_1_TO_5,
      ...(showIf && { showIf }),
    },
  ];
}

const session = (n) => ({ key: 'learning_session', value: `Learning Session ${n}` });

export const SPEAKER_QUESTIONS = [
  // Main speakers (everyone rates these)
  ...speaker('cheng', 'Atty. Kenneth Cheng'),
  ...speaker('sulabo', 'Dr. Rommel Sulabo'),
  ...speaker('delbarrio', 'Dr. Arnel Del Barrio'),
  ...speaker('bautista', 'Dr. Karen Bautista'),
  ...speaker('garcia', 'ASec. Michael J. Garcia'),

  // Learning Session choice
  {
    key: 'learning_session',
    section: 'Learning Session',
    label: 'Which Learning Session did you attend?',
    type: 'choice',
    options: [1, 2, 3].map((n) => ({ value: `Learning Session ${n}`, label: `Learning Session ${n}` })),
  },

  // Learning Session 1
  ...speaker('ls1_sancheztorres', 'Learning Session 1: David Sanchez Torres', session(1)),
  ...speaker('ls1_liu', 'Learning Session 1: Kevin Liu', session(1)),
  ...speaker('ls1_cordobalucio', 'Learning Session 1: Xaviere Cordoba Lucio', session(1)),
  ...speaker('ls1_kim', 'Learning Session 1: Jae Cheol Kim', session(1)),

  // Learning Session 2
  ...speaker('ls2_makhanon', 'Learning Session 2: Metta Makhanon', session(2)),
  ...speaker('ls2_reyes', 'Learning Session 2: Rhona Nina Reyes', session(2)),
  ...speaker('ls2_celi', 'Learning Session 2: Pietro Celi', session(2)),
  ...speaker('ls2_quiazon', 'Learning Session 2: Dr. Karl Marx Quiazon', session(2)),
  ...speaker('ls2_riley', 'Learning Session 2: Dr. William Riley', session(2)),

  // Learning Session 3
  ...speaker('ls3_mariquilla', 'Learning Session 3: Jocelyn Mariquilla', session(3)),
  ...speaker('ls3_nuntawan', 'Learning Session 3: Suparlark Nuntawan Na Ayudhya', session(3)),
  ...speaker('ls3_villacorta', 'Learning Session 3: Concepcion Villacorta', session(3)),
  ...speaker('ls3_jayaraman', 'Learning Session 3: Balachandar Jayaraman', session(3)),
  // Moved from Session 2. Old Session 2 ratings saved as ls2_lemmen are kept in the database.
  ...speaker('ls3_lemmen', 'Learning Session 3: Mr. Johannes Jacobus Wilhelmus Lemmen', session(3)),
];

// Everything the participant sees on the survey form, in order
export const SURVEY_FORM_QUESTIONS = [...SURVEY_QUESTIONS, ...SPEAKER_QUESTIONS];

export const labelFor = (question, value) =>
  question.options?.find((o) => o.value === value)?.label ?? value;