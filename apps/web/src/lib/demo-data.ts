import {
  Activity,
  CalendarCheck,
  ClipboardList,
  PhoneCall,
  TrendingUp,
  Users,
} from "lucide-react";

export const metrics = [
  {
    label: "Обаждания днес",
    value: "18",
    delta: "+22%",
    icon: PhoneCall,
    tone: "teal",
  },
  {
    label: "Нови заявки",
    value: "7",
    delta: "4 спешни",
    icon: Users,
    tone: "blue",
  },
  {
    label: "Записани часове",
    value: "5",
    delta: "до 17:30",
    icon: CalendarCheck,
    tone: "amber",
  },
  {
    label: "Поръчки в ход",
    value: "3",
    delta: "EUR 1,840",
    icon: ClipboardList,
    tone: "red",
  },
];

export const calls = [
  {
    time: "09:14",
    caller: "+359 89 233 7322",
    type: "Климатик не охлажда",
    city: "София, Люлин",
    duration: "03:28",
    status: "lead",
    summary: "Клиентът иска оглед днес след 15:00. Има Samsung 12k BTU.",
  },
  {
    time: "10:02",
    caller: "+359 88 612 9001",
    type: "Термопомпа сервиз",
    city: "Банкя",
    duration: "05:11",
    status: "appointment",
    summary: "Записан оглед за петък 11:30. Има грешка E7 на външно тяло.",
  },
  {
    time: "11:36",
    caller: "+359 87 441 2280",
    type: "Монтаж",
    city: "София, Младост",
    duration: "02:09",
    status: "support",
    summary: "Търси ориентировъчна цена за монтаж на 18k BTU в офис.",
  },
];

export const leads = [
  {
    name: "Иван Петров",
    phone: "+359 89 233 7322",
    service: "Ремонт климатик",
    city: "София",
    urgency: "high",
    status: "new",
  },
  {
    name: "Мария Георгиева",
    phone: "+359 88 612 9001",
    service: "Оглед термопомпа",
    city: "Банкя",
    urgency: "normal",
    status: "booked",
  },
  {
    name: "Office Hub",
    phone: "+359 87 441 2280",
    service: "Монтаж климатик",
    city: "Младост",
    urgency: "normal",
    status: "qualified",
  },
];

export const appointments = [
  {
    time: "Днес 15:30",
    customer: "Иван Петров",
    service: "Оглед климатик",
    address: "София, Люлин 6",
    status: "requested",
  },
  {
    time: "Петък 11:30",
    customer: "Мария Георгиева",
    service: "Термопомпа сервиз",
    address: "Банкя",
    status: "confirmed",
  },
  {
    time: "Понеделник 09:00",
    customer: "Office Hub",
    service: "Монтаж 18k BTU",
    address: "София, Младост 1",
    status: "requested",
  },
];

export const orders = [
  {
    title: "Монтаж Daikin 12k",
    customer: "Иван Петров",
    amount: "EUR 420",
    status: "quoted",
  },
  {
    title: "Сервиз термопомпа",
    customer: "Мария Георгиева",
    amount: "EUR 180",
    status: "approved",
  },
  {
    title: "Офис климатизация",
    customer: "Office Hub",
    amount: "EUR 1,240",
    status: "in_progress",
  },
];

export const activity = [
  {
    title: "Vapi webhook",
    detail: "Чака публичен URL и secret",
    icon: Activity,
  },
  {
    title: "Zadarma",
    detail: "+35924372749 -> +35924372749@sip.vapi.ai",
    icon: PhoneCall,
  },
  {
    title: "Pipeline",
    detail: "Обаждане -> заявка -> час -> поръчка",
    icon: TrendingUp,
  },
];
