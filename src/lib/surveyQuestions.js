// Shared by SurveyPage.jsx (participant form) and SurveyResults.jsx (admin).
// Keys must match the columns in public.survey_responses.

export const SURVEY_TITLE = 'Evaluation Form: 39th PHILSAN Annual Convention';
export const SURVEY_INTRO =
  'Thank you for attending our seminar! We value your feedback to help us improve future events. Please take a few minutes to complete this evaluation form.';

const RATING = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];

export const SURVEY_QUESTIONS = [
  {
    key: 'overall_experience',
    section: 'Overall Experience',
    label: 'How would you rate your overall experience at the seminar?',
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
    label: 'What was the most valuable part of the seminar for you?',
    type: 'text',
  },
  {
    key: 'improvements',
    section: 'Suggestions for Improvement',
    label: 'What could we do to improve future seminars?',
    type: 'text',
  },
  {
    key: 'recommend',
    section: 'Likelihood to Recommend',
    label: 'How likely are you to recommend this seminar to others?',
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

export const labelFor = (question, value) =>
  question.options?.find((o) => o.value === value)?.label ?? value;