// 2nd Pet Symposium — evaluation survey questions.
//
// This is the ONLY file to edit when the survey changes. Answers are saved
// under each question's `key`, so give every question a short, unique key
// and don't rename a key after people have started answering.
//
// Question types:
//   type: 'choice'  → buttons; list them in `options` ({ value, label })
//   type: 'text'    → a text box
// Add `optional: true` to a question that may be left blank.
// `section` groups questions under a heading; `sectionNote` is optional.
//
// While the list is empty, the survey shows "not open yet" in the portal.

export const SURVEY_TITLE = 'Evaluation Form: 2nd Pet Food Symposium';
export const SURVEY_INTRO =
    'Thank you for attending our seminar! We value your feedback to help us improve future events. ' +
    'Please take a few minutes to complete this evaluation form.';

const RATING = [
    { value: 'Excellent', label: 'Excellent' },
    { value: 'Good', label: 'Good' },
    { value: 'Fair', label: 'Fair' },
    { value: 'Poor', label: 'Poor' },
];

const YES_NO = [
    { value: 'Yes', label: 'Yes' },
    { value: 'No', label: 'No' },
];

const LIKELIHOOD = [
    { value: 'Very Likely', label: 'Very Likely' },
    { value: 'Likely', label: 'Likely' },
    { value: 'Neutral', label: 'Neutral' },
    { value: 'Unlikely', label: 'Unlikely' },
];

const SCORE_1_TO_5 = ['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }));

const SPEAKER_NOTE =
    'Please rate the speaker on a scale of 1 to 5, where 1 is the lowest and 5 is the highest rating.';

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
        options: YES_NO,
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
        options: LIKELIHOOD,
    },
    {
        key: 'additional_comments',
        section: "We'd love to hear your feedback.",
        label: "Do you have any additional comments, suggestions, or feedback you'd like to share?",
        type: 'text',
        optional: true,
    },

    // ── Speaker evaluations ──
    {
        key: 'saebey_knowledge',
        section: 'Speaker Evaluation - Ms. Ratchada Saebey',
        sectionNote: SPEAKER_NOTE,
        label: "Speaker's knowledge of the topic",
        type: 'choice',
        options: SCORE_1_TO_5,
    },
    {
        key: 'saebey_delivery',
        section: 'Speaker Evaluation - Ms. Ratchada Saebey',
        label: "Speaker's presentation and delivery",
        type: 'choice',
        options: SCORE_1_TO_5,
    },
    {
        key: 'janist_knowledge',
        section: 'Speaker Evaluation - Ms. Nattanan Janist',
        sectionNote: SPEAKER_NOTE,
        label: "Speaker's knowledge of the topic",
        type: 'choice',
        options: SCORE_1_TO_5,
    },
    {
        key: 'janist_delivery',
        section: 'Speaker Evaluation - Ms. Nattanan Janist',
        label: "Speaker's presentation and delivery",
        type: 'choice',
        options: SCORE_1_TO_5,
    },
    {
        key: 'rodey_knowledge',
        section: 'Speaker Evaluation - Mr. Michael Rodey',
        sectionNote: SPEAKER_NOTE,
        label: "Speaker's knowledge of the topic",
        type: 'choice',
        options: SCORE_1_TO_5,
    },
    {
        key: 'rodey_delivery',
        section: 'Speaker Evaluation - Mr. Michael Rodey',
        label: "Speaker's presentation and delivery",
        type: 'choice',
        options: SCORE_1_TO_5,
    },
];