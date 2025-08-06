
"use client";

import { useState, useEffect, type ChangeEvent, type FormEvent, useRef } from 'react';
import Image from 'next/image';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Minus, Plus, Ghost, Upload, Loader2, BrainCircuit, Calendar as CalendarIcon, BellOff, RefreshCw, XCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { processSchedule, ProcessScheduleOutput } from '@/ai/flows/process-schedule-flow';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, eachDayOfInterval, getDay, parse, isAfter, isValid } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const ELIGIBILITY_THRESHOLD = 74.01;

const checkEligibility = (percentage: number): boolean => {
  return percentage >= ELIGIBILITY_THRESHOLD;
};

const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

const weekdayMap: { [key: string]: number } = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6,
};

type NonInstructionalDay = {
    date: string; // Can be a single date or a range like "Sep 10-15, 2024"
    reason: string;
};

const assessmentDates: { [key: string]: string } = {
    'cat1': '13.08.2025',
    'cat2': '30.09.2025',
    'labfat': '07.11.2025',
    'theoryfat': '14.11.2025'
};


export default function AttendancePage() {
  const { toast } = useToast();
  const [courseName, setCourseName] = useState<string>('');
  const [totalClassesInput, setTotalClassesInput] = useState<string>('');
  const [attendedClassesInput, setAttendedClassesInput] = useState<string>('');
  const [upcomingClassesCountFormInput, setUpcomingClassesCountFormInput] = useState<string>(''); 
  
  const [calculatedCurrentTotal, setCalculatedCurrentTotal] = useState<number | null>(null);
  const [calculatedCurrentAttended, setCalculatedCurrentAttended] = useState<number | null>(null);
  const [currentPercentage, setCurrentPercentage] = useState<number | null>(null);
  const [currentEligible, setCurrentEligible] = useState<boolean | null>(null);

  const [classesLeftForDebar, setClassesLeftForDebar] = useState<number | null>(null); 
  const [attendingFutureClassesCount, setAttendingFutureClassesCount] = useState<number | null>(null);
  
  const [projectedFuturePercentage, setProjectedFuturePercentage] = useState<number | null>(null);
  const [projectedFutureEligible, setProjectedFutureEligible] = useState<boolean | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [pageLoadTime, setPageLoadTime] = useState<string | null>(null);
  
  const [selectedDays, setSelectedDays] = useState<Date[] | undefined>([]);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [semesterEndDate, setSemesterEndDate] = useState<Date | undefined>();
  const [extraInstructionalDays, setExtraInstructionalDays] = useState<string>("");
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  
  const [weeklyTimetableFile, setWeeklyTimetableFile] = useState<File | null>(null);
  const [academicCalendarFile, setAcademicCalendarFile] = useState<File | null>(null);

  const [isProcessingSchedule, setIsProcessingSchedule] = useState(false);
  const [scheduleSummary, setScheduleSummary] = useState<string | null>(null);
  const [extractedClassDays, setExtractedClassDays] = useState<string[]>([]);
  const [nonInstructionalDays, setNonInstructionalDays] = useState<NonInstructionalDay[]>([]);
  const weeklyFileInputRef = useRef<HTMLInputElement>(null);
  const academicCalendarInputRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);

  // Helper to parse date strings from AI, which might be "MMM dd, yyyy"
  const parseDate = (dateString: string, referenceDate?: Date): Date | null => {
    if (!dateString) return null;

    const formats = [
        'dd.MM.yyyy',    // 14.11.2025
        'MMMM d, yyyy', // November 29, 2024
        'MMM d, yyyy',   // Nov 29, 2024
        'MMMM d',        // November 29
        'MMM d',         // Nov 29
    ];

    for (const fmt of formats) {
        // Create a reference date if only month/day is provided. Default to current year if no ref.
        const ref = referenceDate || new Date();
        const parsed = parse(dateString.trim(), fmt, ref);
        if (isValid(parsed)) {
            if (!/yyyy/.test(fmt) && parsed < ref) {
               parsed.setFullYear(ref.getFullYear() + 1);
            }
            return parsed;
        }
    }
    
    console.warn("Could not parse date:", dateString);
    return null;
  };


  useEffect(() => {
    // This now runs only on the client, preventing a hydration mismatch.
    setPageLoadTime(new Date().toLocaleTimeString());
    setIsClient(true);
  }, []);
  
  useEffect(() => {
    if (selectedDays) {
      setUpcomingClassesCountFormInput(selectedDays.length.toString());
    }
  }, [selectedDays]);

  const calculateAndSetSelectedDays = () => {
    const classDayIndexes = extractedClassDays.map(day => weekdayMap[day.toLowerCase()]);
    const normalizedClassDays = extractedClassDays.map(day => day.toLowerCase());

    const dayOrderClasses: Date[] = extraInstructionalDays
        .split(/[\n,]+/)
        .map(line => line.trim())
        .filter(line => line)
        .reduce((acc: Date[], line: string) => {
            // E.g., "23.11.2024 Friday Day Order"
            const parts = line.split(/\s+/);
            const dateStr = parts[0];
            const dayOrderStr = parts[1]?.toLowerCase();

            if (dateStr && dayOrderStr && normalizedClassDays.includes(dayOrderStr)) {
                const date = parse(dateStr, 'dd.MM.yyyy', new Date());
                if (isValid(date)) {
                    acc.push(date);
                }
            } else if (dateStr) { // Handle case where only date is provided
                 const date = parse(dateStr, 'dd.MM.yyyy', new Date());
                 if (isValid(date) && classDayIndexes.includes(getDay(date))) {
                    acc.push(date);
                 }
            }
            return acc;
        }, []);


    let regularClassDates: Date[] = [];
    if (startDate && endDate && extractedClassDays.length) {
       if (endDate >= startDate) {
           let allDates = eachDayOfInterval({ start: startDate, end: endDate });

           const nonInstructionalDateSet = new Set<string>();
            nonInstructionalDays.forEach(item => {
                const dateStr = item.date.trim();
                const rangeParts = dateStr.split(/\s+to\s+|-/);
                try {
                    if (rangeParts.length > 1) { // It's a range
                        const refDate = startDate || new Date();
                        const startDateOfRange = parseDate(rangeParts[0], refDate);
                        let endDateOfRange = parseDate(rangeParts[1], refDate);

                        if (startDateOfRange && endDateOfRange) {
                            // Handle cases like "Sep 10-15" where year is missing for end date
                            if (endDateOfRange < startDateOfRange) { 
                                endDateOfRange.setMonth(startDateOfRange.getMonth());
                                if(endDateOfRange < startDateOfRange) {
                                    endDateOfRange.setFullYear(startDateOfRange.getFullYear() + 1);
                                } else {
                                    endDateOfRange.setFullYear(startDateOfRange.getFullYear());
                                }
                            }
                            if (isValid(startDateOfRange) && isValid(endDateOfRange) && endDateOfRange >= startDateOfRange) {
                                const rangeDates = eachDayOfInterval({ start: startDateOfRange, end: endDateOfRange });
                                rangeDates.forEach(d => nonInstructionalDateSet.add(format(d, 'yyyy-MM-dd')));
                            }
                        } else {
                             console.warn("Could not parse date range:", dateStr);
                        }
                    } else { // It's a single date
                        const singleDate = parseDate(dateStr, startDate);
                        if (singleDate && isValid(singleDate)) {
                            nonInstructionalDateSet.add(format(singleDate, 'yyyy-MM-dd'));
                        }
                    }
                } catch(e) {
                     console.error("Error processing non-instructional day:", dateStr, e);
                }
            });
    
            allDates = allDates.filter(date => !nonInstructionalDateSet.has(format(date, 'yyyy-MM-dd')));

            regularClassDates = allDates.filter(date => classDayIndexes.includes(getDay(date)));
       }
    }
    
    // Combine regular and day-order classes, removing duplicates
    const combinedDates = [...regularClassDates, ...dayOrderClasses];
    const uniqueDates = Array.from(new Set(combinedDates.map(d => d.getTime()))).map(time => new Date(time));

    setSelectedDays(uniqueDates);
  };
  
  // This effect will run when the core data for calculation changes.
  useEffect(() => {
    calculateAndSetSelectedDays();
  }, [startDate, endDate, extractedClassDays, nonInstructionalDays, extraInstructionalDays]);


  const resetCurrentResults = () => {
    setCurrentPercentage(null);
    setCurrentEligible(null);
    setCalculatedCurrentTotal(null);
    setCalculatedCurrentAttended(null);
  };

  const resetFutureScenario = () => {
    setClassesLeftForDebar(null); 
    setAttendingFutureClassesCount(null);
    setProjectedFuturePercentage(null);
    setProjectedFutureEligible(null);
    if (!selectedDays || selectedDays.length === 0) {
      setUpcomingClassesCountFormInput('');
    }
  };
  
  const resetAiResults = () => {
      setScheduleSummary(null);
      setExtractedClassDays([]);
      setSelectedDays([]);
      setNonInstructionalDays([]);
      setSemesterEndDate(undefined);
      setStartDate(undefined);
      setEndDate(undefined);
      setSelectedAssessment('');
  };
  
  const handleResetAll = () => {
    // Reset basic inputs
    setCourseName('');
    setTotalClassesInput('');
    setAttendedClassesInput('');
    setUpcomingClassesCountFormInput('');
    setExtraInstructionalDays('');
    
    // Reset files
    setWeeklyTimetableFile(null);
    setAcademicCalendarFile(null);
    if (weeklyFileInputRef.current) weeklyFileInputRef.current.value = '';
    if (academicCalendarInputRef.current) academicCalendarInputRef.current.value = '';

    // Reset calculation results
    setError(null);
    resetCurrentResults();
    resetFutureScenario();
    
    // Reset AI processing results
    resetAiResults();
    
    toast({
        title: "Form Cleared",
        description: "All inputs and results have been reset.",
    });
  };

  const handleCalculate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    resetCurrentResults();
    resetFutureScenario(); 

    const totalHeld = parseInt(totalClassesInput);
    const attendedTillDate = parseInt(attendedClassesInput);
    const debarClassesLeft = upcomingClassesCountFormInput ? parseInt(upcomingClassesCountFormInput) : null;

    if (isNaN(totalHeld) || isNaN(attendedTillDate)) {
      setError("Please enter valid numbers for total and attended classes.");
      return;
    }

    if (totalHeld <= 0) {
      setError("Total classes held must be a positive number.");
      return;
    }

    if (attendedTillDate < 0) {
      setError("Classes attended (till date) cannot be negative.");
      return;
    }

    if (attendedTillDate > totalHeld) {
      setError("Classes attended (till date) cannot exceed total classes held.");
      return;
    }

    if (upcomingClassesCountFormInput && (debarClassesLeft === null || isNaN(debarClassesLeft) || debarClassesLeft < 0)) {
      setError("Classes left for debar calculation must be a valid non-negative number if provided.");
      return;
    }


    setCalculatedCurrentTotal(totalHeld);
    setCalculatedCurrentAttended(attendedTillDate);
    const percentage = (attendedTillDate / totalHeld) * 100;
    setCurrentPercentage(parseFloat(percentage.toFixed(2)));
    setCurrentEligible(checkEligibility(percentage));

    if (debarClassesLeft !== null && debarClassesLeft >= 0) {
      setClassesLeftForDebar(debarClassesLeft); 
      setAttendingFutureClassesCount(debarClassesLeft); 
    }
  };

  useEffect(() => {
    if (
      calculatedCurrentTotal !== null &&
      calculatedCurrentAttended !== null &&
      classesLeftForDebar !== null && 
      attendingFutureClassesCount !== null &&
      classesLeftForDebar >= 0 
    ) {
      const finalTotal = calculatedCurrentTotal + classesLeftForDebar; 
      const finalAttended = calculatedCurrentAttended + attendingFutureClassesCount;

      if (finalTotal > 0) { 
        const percentage = (finalAttended / finalTotal) * 100;
        setProjectedFuturePercentage(parseFloat(percentage.toFixed(2)));
        setProjectedFutureEligible(checkEligibility(percentage));
      } else if (classesLeftForDebar === 0) { 
        setProjectedFuturePercentage(currentPercentage);
        setProjectedFutureEligible(currentEligible);
      } else {
        setProjectedFuturePercentage(null);
        setProjectedFutureEligible(null);
      }
    } else {
      setProjectedFuturePercentage(null);
      setProjectedFutureEligible(null);
    }
  }, [calculatedCurrentTotal, calculatedCurrentAttended, classesLeftForDebar, attendingFutureClassesCount, currentPercentage, currentEligible]); 


  const handleIncrementAttendingFuture = () => {
    if (attendingFutureClassesCount !== null && classesLeftForDebar !== null) { 
      setAttendingFutureClassesCount(prev => prev !== null ? Math.min(prev + 1, classesLeftForDebar) : 1); 
    }
  };

  const handleDecrementAttendingFuture = () => {
    if (attendingFutureClassesCount !== null) {
      setAttendingFutureClassesCount(prev => prev !== null ? Math.max(prev - 1, 0) : 0);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, setFile: (file: File | null) => void) => {
    const file = e.target.files?.[0] ?? null;
    setFile(file);
    resetAiResults();
  };

  const handleProcessSchedule = async () => {
    if (!weeklyTimetableFile) {
        toast({
            variant: "destructive",
            title: "Missing Timetable",
            description: "Please upload the weekly timetable.",
        });
        return;
    }
    if (!academicCalendarFile) {
        toast({
            variant: "destructive",
            title: "Missing Calendar",
            description: "Please upload the academic calendar PDF.",
        });
        return;
    }
    if (!courseName) {
        toast({
            variant: "destructive",
            title: "Missing Course Code",
            description: "Please enter the course code to search for.",
        });
        return;
    }
    setIsProcessingSchedule(true);
    resetAiResults();

    try {
        const weeklyTimetableDataUri = await fileToDataUri(weeklyTimetableFile);
        const academicCalendarDataUri = await fileToDataUri(academicCalendarFile);

        const result: ProcessScheduleOutput = await processSchedule({
            weeklyTimetableDataUri,
            academicCalendarDataUri,
            courseCode: courseName,
        });
        
        if (result.classDays && result.classDays.length > 0) {
            setExtractedClassDays(result.classDays);
            toast({
                title: "Schedule Processed",
                description: `Successfully identified class days for ${courseName}. Now select a date range.`,
            });
        } else {
             toast({
                variant: "destructive",
                title: "Processing Failed",
                description: result.reason || "Could not identify class dates from the provided documents.",
            });
        }
        
        if (result.reason) {
          setScheduleSummary(result.reason);
        }

        if (result.nonInstructionalDays && result.nonInstructionalDays.length > 0) {
            setNonInstructionalDays(result.nonInstructionalDays);
        }
        
        if (result.lastInstructionalDay) {
            const refDate = startDate || new Date();
            const lastDay = parseDate(result.lastInstructionalDay, refDate);
            if (lastDay && isValid(lastDay)) {
                // Don't set end date from here anymore, use it as the max date
                setSemesterEndDate(lastDay);
                 if (!endDate) {
                    setEndDate(lastDay);
                }
            }
        }


    } catch (err: any) {
        console.error(err);
        toast({
            variant: "destructive",
            title: "An Error Occurred",
            description: err.message || "Failed to process the schedule. Please try again.",
        });
    } finally {
        setIsProcessingSchedule(false);
    }
  };

  const handleEndDateChange = (date: Date | undefined) => {
    if (date && semesterEndDate && isAfter(date, semesterEndDate)) {
        toast({
            variant: "destructive",
            title: "Invalid Date",
            description: `You cannot select a date after the last instructional day (${format(semesterEndDate, "PPP")}).`,
        });
    } else {
        setEndDate(date);
        setSelectedAssessment(''); // Reset dropdown if manual date is picked
    }
  };

  const handleStartDateChange = (date: Date | undefined) => {
    if (date && semesterEndDate && isAfter(date, semesterEndDate)) {
        toast({
            variant: "destructive",
            title: "Invalid Date",
            description: `Start date cannot be after the last instructional day (${format(semesterEndDate, "PPP")}).`,
        });
    } else {
        setStartDate(date);
    }
  };

  const handleAssessmentChange = (value: string) => {
    setSelectedAssessment(value);
    if (!value) {
      return;
    }
    const dateStr = assessmentDates[value];
    if (dateStr) {
      const newEndDate = parseDate(dateStr);
      if (newEndDate && isValid(newEndDate)) {
        if (semesterEndDate && isAfter(newEndDate, semesterEndDate)) {
            toast({
                variant: "destructive",
                title: "Invalid Date",
                description: `You cannot select a date after the last instructional day (${format(semesterEndDate, "PPP")}).`,
            });
        } else {
            setEndDate(newEndDate);
        }
      }
    }
  };


  return (
    <div role="main" className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 selection:bg-primary/20 selection:text-primary">
      <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
        <div className="lg:w-1/2">
            <Card className="w-full shadow-xl rounded-lg overflow-hidden">
                <CardHeader>
                    <CardTitle>Automate Class Selection</CardTitle>
                    <CardDescription>Upload your weekly timetable and academic calendar to automatically select class days.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2">
                      <Label htmlFor="courseName" className="text-foreground font-medium text-sm">Course Name / Code</Label>
                      <Input
                        id="courseName"
                        type="text"
                        placeholder="e.g.,BCSE301L-TH/BCSE301P-LO"
                        value={courseName}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setCourseName(e.target.value)}
                        className="bg-secondary/70 border-border focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="weekly-timetable">1. Weekly Timetable</Label>
                        <Input 
                          id="weekly-timetable" 
                          type="file" 
                          ref={weeklyFileInputRef}
                          onChange={(e) => handleFileChange(e, setWeeklyTimetableFile)}
                          accept=".png,.jpg,.jpeg"
                          className="file:text-primary file:font-semibold"
                        />
                         {weeklyTimetableFile && <p className="text-xs text-muted-foreground">Selected: {weeklyTimetableFile.name}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="academic-calendar">2. Academic Calendar (PDF)</Label>
                        <Input 
                          id="academic-calendar" 
                          type="file" 
                          ref={academicCalendarInputRef}
                          onChange={(e) => handleFileChange(e, setAcademicCalendarFile)}
                          accept=".pdf"
                          className="file:text-primary file:font-semibold"
                        />
                         {academicCalendarFile && <p className="text-xs text-muted-foreground">Selected: {academicCalendarFile.name}</p>}
                    </div>
                    
                    {scheduleSummary && <p className="text-sm text-muted-foreground font-medium pt-2">{scheduleSummary}</p>}

                    <Button onClick={handleProcessSchedule} disabled={isProcessingSchedule || !weeklyTimetableFile || !academicCalendarFile} className="w-full">
                        {isProcessingSchedule ? <Loader2 className="animate-spin" /> : <BrainCircuit />}
                        {isProcessingSchedule ? 'Processing...' : 'Process Schedule with AI'}
                    </Button>
                    
                    {nonInstructionalDays.length > 0 && (
                        <Card className="mt-4 animate-in fade-in-0">
                           <CardHeader className='p-4'>
                             <CardTitle className='text-base flex items-center gap-2'><BellOff className='h-4 w-4'/> Non-Instructional Days Found</CardTitle>
                           </CardHeader>
                           <CardContent className='p-4 pt-0 max-h-40 overflow-y-auto'>
                             <ul className='text-sm space-y-1'>
                                 {nonInstructionalDays.map((day, index) => (
                                     <li key={index} className='flex justify-between'>
                                         <span className='text-muted-foreground'>{day.date}</span>
                                         <span className='font-medium'>{day.reason}</span>
                                     </li>
                                 ))}
                             </ul>
                           </CardContent>
                        </Card>
                    )}


                    <Separator />

                    <div className="space-y-2">
                      <Label>3. Select Date Range</Label>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !startDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {startDate ? format(startDate, "PPP") : <span>Pick a start date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={startDate}
                                onSelect={handleStartDateChange}
                                initialFocus
                                disabled={isProcessingSchedule || (semesterEndDate ? { after: semesterEndDate } : undefined)}
                              />
                            </PopoverContent>
                          </Popover>
                          {endDate && (
                             <div className="flex items-center justify-center p-2 border rounded-md text-sm">
                                {`End Date: ${format(endDate, "PPP")}`}
                             </div>
                          )}
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Select DEADLINE for DEBAR Calculation</div>
                        <Select onValueChange={handleAssessmentChange} value={selectedAssessment} disabled={isProcessingSchedule}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select an assessment..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cat1">CAT-I</SelectItem>
                                <SelectItem value="cat2">CAT-II</SelectItem>
                                <SelectItem value="labfat">LAB FAT</SelectItem>
                                <SelectItem value="theoryfat">THEORY FAT</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="extra-instructional-days">4. Extra Instructional Days</Label>
                         <div className="flex items-center gap-2">
                            <Textarea
                              id="extra-instructional-days"
                              placeholder="e.g., 23.11.2024 Friday Day Order. Enter one per line."
                              value={extraInstructionalDays}
                              onChange={(e) => setExtraInstructionalDays(e.target.value)}
                              className="bg-secondary/70 border-border focus:ring-primary focus:border-primary flex-grow"
                            />
                            <Button 
                              variant="outline" 
                              size="icon" 
                              onClick={calculateAndSetSelectedDays} 
                              aria-label="Update calendar with extra days"
                              className="flex-shrink-0"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>

                <Separator className="my-4" />

                <CardHeader>
                    <CardTitle>Upcoming Class Dates</CardTitle>
                    <CardDescription>The calendar below highlights your automatically selected class dates.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center">
                    {isClient && <Calendar
                        mode="multiple"
                        selected={selectedDays}
                        onSelect={setSelectedDays}
                        className="rounded-md border"
                        disabled={(date) => isProcessingSchedule || (semesterEndDate ? isAfter(date, semesterEndDate) : false)}
                        modifiers={{
                           nonInstructional: nonInstructionalDays.flatMap(day => {
                                if (day.date.includes('-')) return [];
                                const parsedDate = parseDate(day.date);
                                return parsedDate && isValid(parsedDate) ? [parsedDate] : [];
                           }),
                           semesterEnd: semesterEndDate,
                        }}
                        modifiersStyles={{
                            nonInstructional: { textDecoration: 'line-through', color: 'hsl(var(--muted-foreground))' },
                            semesterEnd: { color: 'hsl(var(--destructive))', fontWeight: 'bold' }
                        }}
                    />}
                </CardContent>
             </Card>
        </div>
        <div className="lg:w-1/2">
            <Card className="w-full shadow-xl rounded-lg overflow-hidden">
                <CardHeader className="text-center bg-card p-6 border-b border-border">
                <div className="mx-auto mb-3 w-fit">
                   <Image
                      src="/icon.png"
                      alt="Attendance Ally Logo"
                      width={48}
                      height={48}
                      priority
                   />
                </div>
                <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">Attendance Ally</CardTitle>
                <CardDescription className="text-muted-foreground pt-1 text-sm sm:text-base">
                    Check your exam eligibility based on attendance. (75% criteria met if actual >= 74.01%)
                </CardDescription>
                </CardHeader>
                <CardContent className="p-6 bg-card">
                <form onSubmit={handleCalculate} className="space-y-5">
                    
                    <div className="space-y-2">
                    <Label htmlFor="totalClassesHeld" className="text-foreground font-medium text-sm">Total Classes Held</Label>
                    <Input
                        id="totalClassesHeld"
                        type="number"
                        placeholder="e.g., 80"
                        value={totalClassesInput}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setTotalClassesInput(e.target.value)}
                        min="1"
                        required
                        className="bg-secondary/70 border-border focus:ring-primary focus:border-primary"
                    />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="attendedClassesTillDate" className="text-foreground font-medium text-sm">Classes Attended (till date)</Label>
                    <Input
                        id="attendedClassesTillDate"
                        type="number"
                        placeholder="e.g., 60"
                        value={attendedClassesInput}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setAttendedClassesInput(e.target.value)}
                        min="0"
                        required
                        className="bg-secondary/70 border-border focus:ring-primary focus:border-primary"
                    />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="classesLeftForDebar" className="text-foreground font-medium text-sm">Classes left before Debar calculation</Label>
                    <Input
                        id="classesLeftForDebar" 
                        type="number"
                        placeholder="e.g., 10"
                        value={upcomingClassesCountFormInput} 
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setUpcomingClassesCountFormInput(e.target.value)}
                        min="0"
                        readOnly={selectedDays && selectedDays.length > 0}
                        className={`bg-secondary/70 border-border focus:ring-primary focus:border-primary ${selectedDays && selectedDays.length > 0 ? 'cursor-not-allowed' : ''}`}
                    />
                    </div>
                    {error && (
                    <p id="formError" role="alert" className="text-sm font-medium text-destructive flex items-center gap-2 p-3 bg-destructive/10 rounded-md border border-destructive/30">
                        <AlertCircle className="h-5 w-5 flex-shrink-0" />
                        {error}
                    </p>
                    )}
                    <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 text-base rounded-md shadow-md hover:shadow-lg transition-all duration-150 ease-in-out active:scale-[0.98]">
                    Calculate Eligibility
                    </Button>
                </form>
                </CardContent>

                {currentPercentage !== null && (
                <CardFooter 
                    className="flex flex-col items-center space-y-4 p-6 bg-card border-t border-border animate-in fade-in-0 zoom-in-95 duration-500"
                >
                    <div className="w-full text-center">
                        <p className="text-base sm:text-lg font-semibold text-foreground">Your Current Attendance Percentage:</p>
                        <p className="text-4xl sm:text-5xl font-bold text-primary tabular-nums my-1">
                        {currentPercentage.toFixed(2)}%
                        </p>
                        <Progress value={currentPercentage} className="mt-2.5 h-2.5 sm:h-3 [&>div]:bg-primary rounded-full" aria-label={`Current Attendance: ${currentPercentage.toFixed(2)}%`} />
                    </div>

                    {currentEligible !== null && (
                    <div
                        role="status"
                        aria-live="polite"
                        className={`mt-4 p-3 sm:p-4 rounded-md w-full text-center text-base sm:text-lg font-semibold transition-all duration-300 ease-in-out shadow-sm
                        ${ currentEligible 
                            ? 'bg-accent/10 text-accent border border-accent/30' 
                            : 'bg-destructive/10 text-destructive border border-destructive/30'
                        }`}
                    >
                        {currentEligible ? (
                        <div className="flex items-center justify-center gap-2">
                            <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-accent flex-shrink-0" />
                            <span>Congratulations! You are currently eligible for exams.</span>
                        </div>
                        ) : (
                        <div className="flex items-center justify-center gap-2">
                            <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-destructive flex-shrink-0" />
                            <span>Sorry, you need {ELIGIBILITY_THRESHOLD.toFixed(2)}% attendance. You are currently not eligible.</span>
                        </div>
                        )}
                    </div>
                    )}
                </CardFooter>
                )}

                {currentPercentage !== null && classesLeftForDebar !== null && classesLeftForDebar > 0 && ( 
                <CardContent className="p-6 bg-card border-t border-border animate-in fade-in-0 zoom-in-95 duration-500">
                    <CardHeader className="p-0 mb-4 text-center">
                    <CardTitle className="text-xl sm:text-2xl font-bold text-primary">Future Attendance Scenario</CardTitle>
                    <CardDescription className="text-muted-foreground pt-1 text-sm">
                        For the next {classesLeftForDebar} class(es) before debar:
                    </CardDescription>
                    </CardHeader>
                    <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="attendingFuture" className="text-foreground font-medium text-sm">
                        Classes you will attend (out of {classesLeftForDebar}):
                        </Label>
                        <div className="flex items-center justify-center gap-3">
                        <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={handleDecrementAttendingFuture} 
                            disabled={attendingFutureClassesCount === null || attendingFutureClassesCount <= 0}
                            aria-label="Decrease future classes attended"
                        >
                            <Minus className="h-4 w-4" />
                        </Button>
                        <span className="text-lg font-semibold text-primary tabular-nums min-w-[3ch] text-center">
                            {attendingFutureClassesCount ?? '-'}
                        </span>
                        <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={handleIncrementAttendingFuture} 
                            disabled={attendingFutureClassesCount === null || classesLeftForDebar === null || attendingFutureClassesCount >= classesLeftForDebar}
                            aria-label="Increase future classes attended"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                        </div>
                    </div>

                    {projectedFuturePercentage !== null && (
                        <div className="mt-4 space-y-3 text-center">
                        <p className="text-foreground">
                            If you attend <strong className="text-primary">{attendingFutureClassesCount}</strong> and miss <strong className="text-destructive">{classesLeftForDebar - (attendingFutureClassesCount ?? 0)}</strong> class(es):
                        </p>
                        <div>
                            <p className="text-base sm:text-lg font-semibold text-foreground">Your Projected Attendance:</p>
                            <p className="text-3xl sm:text-4xl font-bold text-primary tabular-nums my-1">
                            {projectedFuturePercentage.toFixed(2)}%
                            </p>
                            <Progress value={projectedFuturePercentage} className="mt-2 h-2 sm:h-2.5 [&>div]:bg-primary rounded-full" aria-label={`Projected Attendance: ${projectedFuturePercentage.toFixed(2)}%`} />
                        </div>
                        
                        {projectedFutureEligible !== null && (
                            <div
                            role="status"
                            aria-live="polite"
                            className={`mt-3 p-3 rounded-md w-full text-center text-base font-semibold
                                ${ projectedFutureEligible 
                                ? 'bg-accent/10 text-accent border border-accent/30' 
                                : 'bg-destructive/10 text-destructive border border-destructive/30'
                                }`}
                            >
                            {projectedFutureEligible ? (
                                <div className="flex items-center justify-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-accent flex-shrink-0" />
                                <span>You will be eligible for exams.</span>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center gap-2">
                                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                                <span>You will not be eligible for exams.</span>
                                </div>
                            )}
                            </div>
                        )}
                        </div>
                    )}
                    </div>
                </CardContent>
                )}
                 <CardFooter className="p-6 pt-0">
                    <Button 
                        variant="outline" 
                        onClick={handleResetAll} 
                        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reset All
                    </Button>
                </CardFooter>
            </Card>
        </div>
      </div>
       <footer className="mt-8 text-center text-xs sm:text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} ClassPonumaa?!?. All rights reserved. {pageLoadTime ? `(Loaded at ${pageLoadTime})` : ''}</p>
      </footer>
    </div>
  );
}


    

    
