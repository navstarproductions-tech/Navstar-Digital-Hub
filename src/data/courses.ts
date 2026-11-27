import type { Course } from '../types';

const courseImages = {
  robotics: 'https://images.unsplash.com/photo-1561144257-e32e8efc6e58?auto=format&fit=crop&w=1200&q=85',
  web: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=85',
  maintenance: 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?auto=format&fit=crop&w=1200&q=85',
  video: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=1200&q=85',
  design: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=1200&q=85',
  python: 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=1200&q=85',
  advanced: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85',
  programming: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=85',
  digital: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=85',
};

export const INITIAL_COURSES: Course[] = [
  { id: 'computer-programming', title: 'Computer Programming', description: 'Build a strong foundation in computer applications, programming concepts, productivity software, and digital problem-solving.', price: 2650, duration: '4 Months', image: courseImages.programming, category: 'Computer School', level: 'Intermediate' },
  { id: 'advanced-programming', title: 'Advanced Computer Programming', description: 'Advance your skills in software development, databases, automation, application security, and structured programming.', price: 2700, duration: '4 Months', image: courseImages.advanced, category: 'Professional', level: 'Advanced' },
  { id: 'web-design', title: 'Web Design', description: 'Plan and create attractive, responsive websites through practical page design, layout, visual structure, and publishing skills.', price: 0, duration: 'To be confirmed', image: courseImages.web, category: 'Professional', level: 'Beginner' },
  { id: 'graphic-design', title: 'Graphic Design', description: 'Develop design principles, visual communication, layout, typography, and practical skills using professional design software.', price: 2600, duration: '4 Months', image: courseImages.design, category: 'Professional', level: 'Beginner' },
  { id: 'robotics-automation', title: 'Automation and Robotics', description: 'Explore robotics, the Internet of Things (IoT), and smart systems. Learn how intelligent machines are designed, programmed, automated, and controlled to solve real-world challenges.', price: 2800, duration: '3 Months', image: courseImages.robotics, category: 'Professional', level: 'Beginner' },
  { id: 'video-editing', title: 'Introduction to Video Editing', description: 'Learn video editing fundamentals, storytelling, editing workflows, colour correction, and motion graphics integration.', price: 2500, duration: '4 Months', image: courseImages.video, category: 'Professional', level: 'Beginner' },
  { id: 'html-css', title: 'HTML and CSS Coding Course', description: 'Build the foundations of web development with HTML5, CSS styling, responsive layouts, Flexbox, Grid, forms, and website publishing.', price: 4190, duration: '6 Months', image: courseImages.web, category: 'Professional', level: 'Beginner' },
  { id: 'computer-maintenance', title: 'Basic Maintenance and Troubleshooting', description: 'Learn essential computer maintenance, hardware and software troubleshooting, diagnostics, and security awareness.', price: 2500, duration: '4 Months', image: courseImages.maintenance, category: 'Computer School', level: 'Beginner' },
  { id: 'integrated-digital-services', title: 'Integrated Digital Service Delivery', description: 'A practical programme in digital literacy, cyber operations, online platforms, and modern digital service delivery.', price: 3000, duration: '4 Months', image: courseImages.digital, category: 'Cyber Services', level: 'Beginner' },
  { id: 'python-programming', title: 'Python Programming', description: 'Learn Python syntax, problem solving, programming logic, and practical projects for real-world applications.', price: 2500, duration: '4 Months', image: courseImages.python, category: 'Professional', level: 'Intermediate' },
];
