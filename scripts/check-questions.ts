import { questions, validateQuestionBank } from '../src/questions';

validateQuestionBank();
const modules = new Set(questions.map((question) => question.module));
console.log(`Validated ${questions.length} questions across modules ${Math.min(...modules)}–${Math.max(...modules)}.`);
