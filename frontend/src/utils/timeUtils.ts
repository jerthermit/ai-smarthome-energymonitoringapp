// frontend/src/utils/timeUtils.ts

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export const getTimeOfDay = (): TimeOfDay => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
};

export const getGreeting = (name?: string): string => {
  const timeOfDay = getTimeOfDay();
  const greetings = {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    night: 'Good evening'
  };
  return name ? `${greetings[timeOfDay]}, ${name}` : greetings[timeOfDay];
};

export const formatTime = (date: Date = new Date()): string => {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

export const formatDate = (date: Date = new Date()): string => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
