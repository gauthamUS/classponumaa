
'use server';
/**
 * @fileOverview An AI flow to process student schedules.
 *
 * - processSchedule: A function that analyzes a timetable image and an academic calendar to determine the precise class dates for a specific course.
 * - ProcessScheduleInput: The input type for the processSchedule function.
 * - ProcessScheduleOutput: The return type for the processSchedule function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const ProcessScheduleInputSchema = z.object({
  weeklyTimetableDataUri: z
    .string()
    .describe(
      "A screenshot of the weekly class timetable, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'. The timetable has green slots for class periods."
    ),
  academicCalendarDataUri: z
    .string()
    .describe(
      "The academic calendar as a data URI (must be a PDF) that includes a MIME type and uses Base64 encoding. The calendar lists instructional days, holidays, and exam periods."
    ),
  courseCode: z.string().describe("The course code to look for in the timetable, e.g., 'BCSE301L'."),
});
export type ProcessScheduleInput = z.infer<typeof ProcessScheduleInputSchema>;

const NonInstructionalDaySchema = z.object({
    date: z.string().describe("The date or date range of the non-instructional day(s), e.g., 'August 15, 2024' or 'Sep 10-15, 2024'."),
    reason: z.string().describe("The reason for it being a non-instructional day, e.g., 'Holiday', 'CAT-I'."),
});

const ProcessScheduleOutputSchema = z.object({
  classDays: z.array(z.string().describe("A list of weekdays, e.g., ['Tuesday', 'Thursday', 'Friday'].")).describe("List of weekdays for the course."),
  reason: z.string().optional().describe("Reasoning for the determined schedule or why it failed."),
  nonInstructionalDays: z.array(NonInstructionalDaySchema).optional().describe("A list of all identified holidays and non-instructional days."),
  lastInstructionalDay: z.string().optional().describe("The last instructional day for theory classes, e.g., 'November 29, 2024'."),
});
export type ProcessScheduleOutput = z.infer<typeof ProcessScheduleOutputSchema>;


export async function processSchedule(input: ProcessScheduleInput): Promise<ProcessScheduleOutput> {
  return processScheduleFlow(input);
}


const schedulePrompt = ai.definePrompt({
    name: 'schedulePrompt',
    input: { schema: ProcessScheduleInputSchema },
    output: { schema: ProcessScheduleOutputSchema },
    prompt: `You are an intelligent assistant for a university student. Your task is to determine the class schedule for a specific course based on a weekly timetable image and an academic calendar PDF.

    **Analysis Steps:**

    1.  **Analyze the Weekly Timetable for the Course:**
        *   Look for cells inside green-colored boxes in the timetable image that contain the course code '{{{courseCode}}}'.
        *   **Crucially, you must perform an EXACT, case-sensitive match for the course code substring.** For example, if the course code is 'BCSE301P', you must find a cell containing 'BCSE301P'. Do NOT match 'BCSE301L' or any other variation. The course code must be present in the cell's text exactly as provided.
        *   If a cell contains multiple course codes, only consider it a match if '{{{courseCode}}}' is present exactly. Ignore other course codes in the same cell.
        *   For each green box with an exact match, look at the very first column of that same row to identify the day of the week (e.g., MON, TUE, WED, THU, FRI).
        *   List the full weekdays that have classes for this course. For example: If classes are on TUE, THU, FRI, the output should be ["Tuesday", "Thursday", "Friday"].

    2.  **Extract Non-Instructional Days from the Academic Calendar:**
        *   Scan the academic calendar PDF thoroughly.
        *   Identify all dates marked as "No instructional day", "Holiday", "Continuous Assessment Test - I", "Continuous Assessment Test - II", or "TechnoVIT".
        *   **Important**: If any of these are specified as a date range (e.g., "September 10-15" or "October 2-4"), keep the range as is in the output. Do not expand it.
        *   Create a list of all these dates. For each entry, provide the date (or date range) and the specific reason (e.g., "Holiday", "CAT-I").

    3.  **Identify the Last Instructional Day:**
        *   Find the date specified as the "Last Instructional Day for theory classes" in the calendar.
        *   Return this date in the 'lastInstructionalDay' field.

    **Output Format:**

    *   Return a JSON object.
    *   In the 'classDays' array, provide the full names of the weekdays identified from the timetable.
    *   In the 'nonInstructionalDays' array, provide the list of dates/ranges and reasons you extracted.
    *   In the 'lastInstructionalDay' field, provide the date you found.
    *   In the 'reason' field, provide a brief summary of your findings, for example: "Based on the timetable, classes for {{{courseCode}}} are on Tuesdays, Thursdays, and Fridays."
    *   If you cannot find an exact match for the course code, return an empty 'classDays' array and explain the issue in the 'reason' field.

    **Image and PDF Input:**

    Weekly Timetable: {{media url=weeklyTimetableDataUri}}
    Academic Calendar: {{media url=academicCalendarDataUri}}
    `,
});


const processScheduleFlow = ai.defineFlow(
  {
    name: 'processScheduleFlow',
    inputSchema: ProcessScheduleInputSchema,
    outputSchema: ProcessScheduleOutputSchema,
  },
  async (input) => {
    try {
        const { output } = await schedulePrompt(input);
        if (!output) {
          return {
            classDays: [],
            reason: "The AI model did not return a valid response. Please check if the documents are clear and try again."
          };
        }
        return output;
    } catch (e: any) {
        console.error("Error in processScheduleFlow:", e);
        // Check for a specific error message indicating an overloaded service.
        if (e.message && e.message.includes('503')) {
            return {
                classDays: [],
                reason: "The AI service is currently overloaded. Please wait a moment and try again."
            };
        }
        // Return a generic error for other issues.
        return {
            classDays: [],
            reason: "An unexpected error occurred while processing the schedule. Please ensure your documents are clear and try again."
        };
    }
  }
);
