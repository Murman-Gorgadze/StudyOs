import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addDays, todayIn } from '../src/domain/dates.js';
import { occurrenceDays, parseRecurrenceConfig } from '../src/domain/recurrence.js';
import { computeStreak } from '../src/domain/scoring.js';
import { ACHIEVEMENTS } from '../src/services/engagement.js';
import { buildScoreInput } from '../src/services/occurrences.js';

const prisma = new PrismaClient();

const TZ = 'Asia/Tbilisi';
const TODAY = todayIn(TZ);
const PASSWORD = 'goalify123';

async function reset() {
  // Order matters only for readability; every relation cascades from User/Goal.
  await prisma.rewardTransaction.deleteMany();
  await prisma.taskOccurrence.deleteMany();
  await prisma.taskDefinition.deleteMany();
  await prisma.goalInvitation.deleteMany();
  await prisma.goalParticipant.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.session.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser(name: string, email: string, avatarEmoji: string) {
  return prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      profile: { create: { avatarEmoji, timezone: TZ } },
    },
    include: { profile: true },
  });
}

const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });

async function main() {
  await reset();

  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.create({ data: { ...a } });
  }

  const kitty = await createUser('Kitty', 'kitty@goalify.app', '🐱');
  const alex = await createUser('Alex', 'alex@goalify.app', '🦊');
  const maria = await createUser('Maria', 'maria@goalify.app', '🐼');
  const luka = await createUser('Luka', 'luka@goalify.app', '🐧');
  const dana = await createUser('Dana', 'dana@goalify.app', '🦉');

  // Kitty is friends with Alex and Maria; Luka has a pending request out to Kitty.
  await prisma.friendship.create({
    data: { ...pair(kitty.id, alex.id), status: 'ACCEPTED', requestedById: kitty.id },
  });
  await prisma.friendship.create({
    data: { ...pair(kitty.id, maria.id), status: 'ACCEPTED', requestedById: maria.id },
  });
  await prisma.friendship.create({
    data: { ...pair(kitty.id, luka.id), status: 'PENDING', requestedById: luka.id },
  });

  // ---------------------------------------------------------------- goals

  const startedDaysAgo = 13;
  const goalStart = addDays(TODAY, -startedDaysAgo);

  // A shared private challenge — a Goal with several participants.
  const getFit = await prisma.goal.create({
    data: {
      ownerId: kitty.id,
      title: 'Get Fit',
      description: 'Become more active and improve my fitness.',
      category: 'FITNESS',
      visibility: 'PRIVATE',
      targetType: 'HABIT',
      timezone: TZ,
      startDate: goalStart,
      tasks: {
        create: [
          {
            title: 'Walk 8,000 steps',
            recurrenceType: 'EVERY_DAY',
            recurrenceConfig: '{}',
            reward: 15,
            startDate: goalStart,
            reminderTime: '09:00',
          },
          {
            title: 'Drink 2L of water',
            recurrenceType: 'EVERY_DAY',
            recurrenceConfig: '{}',
            reward: 10,
            startDate: goalStart,
            reminderTime: '12:00',
          },
          {
            title: 'Go to the gym',
            recurrenceType: 'SPECIFIC_WEEKDAYS',
            recurrenceConfig: JSON.stringify({ weekdays: [1, 3, 5] }),
            reward: 20,
            startDate: goalStart,
            reminderTime: '18:30',
          },
        ],
      },
    },
    include: { tasks: true },
  });

  // A personal private goal — same Goal system, a single participant.
  const readMore = await prisma.goal.create({
    data: {
      ownerId: kitty.id,
      title: 'Read More',
      description: 'Finish 10 books this year.',
      category: 'READING',
      visibility: 'PRIVATE',
      targetType: 'QUANTITY',
      targetValue: 10,
      timezone: TZ,
      startDate: goalStart,
      tasks: {
        create: [
          {
            title: 'Read 20 pages',
            recurrenceType: 'EVERY_DAY',
            recurrenceConfig: '{}',
            reward: 10,
            startDate: goalStart,
            reminderTime: '21:00',
          },
        ],
      },
    },
    include: { tasks: true },
  });

  // A public challenge anyone can discover and join.
  const reading = await prisma.goal.create({
    data: {
      ownerId: alex.id,
      title: '30-Day Reading Challenge',
      description: 'Read at least 20 pages every day for 30 days.',
      category: 'READING',
      visibility: 'PUBLIC',
      targetType: 'HABIT',
      timezone: TZ,
      startDate: goalStart,
      deadline: addDays(goalStart, 29),
      tasks: {
        create: [
          {
            title: 'Read 20 pages',
            recurrenceType: 'EVERY_DAY',
            recurrenceConfig: '{}',
            reward: 20,
            startDate: goalStart,
            endDate: addDays(goalStart, 29),
          },
        ],
      },
    },
    include: { tasks: true },
  });

  const morning = await prisma.goal.create({
    data: {
      ownerId: maria.id,
      title: 'Morning Routine',
      description: 'Wake up early and start the day with intention.',
      category: 'PRODUCTIVITY',
      visibility: 'PUBLIC',
      targetType: 'HABIT',
      timezone: TZ,
      startDate: goalStart,
      tasks: {
        create: [
          {
            title: 'Wake up before 7am',
            recurrenceType: 'EVERY_DAY',
            recurrenceConfig: '{}',
            reward: 15,
            startDate: goalStart,
          },
          {
            title: 'Stretch for 10 minutes',
            recurrenceType: 'TIMES_PER_WEEK',
            recurrenceConfig: JSON.stringify({ timesPerWeek: 4 }),
            reward: 10,
            startDate: goalStart,
          },
        ],
      },
    },
    include: { tasks: true },
  });

  // ---------------------------------------------------------- participants

  const join = (goalId: string, userId: string, role: string, joinedOn: string) =>
    prisma.goalParticipant.create({ data: { goalId, userId, role, joinedOn } });

  const fitKitty = await join(getFit.id, kitty.id, 'OWNER', goalStart);
  const fitAlex = await join(getFit.id, alex.id, 'MEMBER', goalStart);
  const fitMaria = await join(getFit.id, maria.id, 'MEMBER', addDays(goalStart, 4));

  const readKitty = await join(readMore.id, kitty.id, 'OWNER', goalStart);

  const chAlex = await join(reading.id, alex.id, 'OWNER', goalStart);
  const chKitty = await join(reading.id, kitty.id, 'MEMBER', addDays(goalStart, 3));
  const chMaria = await join(reading.id, maria.id, 'MEMBER', goalStart);
  const chLuka = await join(reading.id, luka.id, 'MEMBER', addDays(goalStart, 6));
  const chDana = await join(reading.id, dana.id, 'MEMBER', goalStart);

  await join(morning.id, maria.id, 'OWNER', goalStart);
  await join(morning.id, dana.id, 'MEMBER', goalStart);

  // Kitty has a pending invitation to Maria's public challenge.
  await prisma.goalInvitation.create({
    data: { goalId: morning.id, inviterId: maria.id, inviteeId: kitty.id, status: 'PENDING' },
  });

  // ------------------------------------------------------------ occurrences

  const allGoals = [
    { goal: getFit, participants: [fitKitty, fitAlex, fitMaria] },
    { goal: readMore, participants: [readKitty] },
    { goal: reading, participants: [chAlex, chKitty, chMaria, chLuka, chDana] },
  ];

  const rows: Array<{ taskDefinitionId: string; participantId: string; dueDate: string }> = [];
  for (const { goal, participants } of allGoals) {
    for (const participant of participants) {
      const from = participant.joinedOn > goal.startDate ? participant.joinedOn : goal.startDate;
      const to = goal.deadline && goal.deadline < addDays(TODAY, 14) ? goal.deadline : addDays(TODAY, 14);
      for (const task of goal.tasks) {
        const schedule = {
          recurrenceType: task.recurrenceType as never,
          recurrenceConfig: parseRecurrenceConfig(task.recurrenceConfig),
          startDate: task.startDate,
          endDate: task.endDate,
        };
        for (const dueDate of occurrenceDays(schedule, from, to)) {
          rows.push({ taskDefinitionId: task.id, participantId: participant.id, dueDate });
        }
      }
    }
  }
  await prisma.taskOccurrence.createMany({ data: rows });

  // --------------------------------------------------- historical completions

  /** Deterministic 0..1 hash, so re-seeding always produces the same history. */
  function noise(...parts: string[]): number {
    let h = 2166136261;
    for (const part of parts) {
      for (let i = 0; i < part.length; i++) {
        h ^= part.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  /** Mark a share of each past day's occurrences complete, to build real history. */
  async function fillHistory(participantId: string, rate: number, includeToday = false) {
    const occurrences = await prisma.taskOccurrence.findMany({
      where: { participantId, dueDate: { lte: TODAY } },
      include: { taskDefinition: true },
      orderBy: { dueDate: 'asc' },
    });

    const byDay = new Map<string, typeof occurrences>();
    for (const o of occurrences) {
      if (!includeToday && o.dueDate === TODAY) continue;
      const list = byDay.get(o.dueDate) ?? [];
      list.push(o);
      byDay.set(o.dueDate, list);
    }

    // Track the reward per occurrence so the history shows what was actually
    // earned, rather than a row of +0.
    const completed: Array<{ id: string; reward: number }> = [];
    let coins = 0;
    for (const [day, list] of byDay) {
      // Each task is decided independently, so days land on a spread of
      // percentages rather than everyone sitting on a flat 100%.
      for (const o of list) {
        if (noise(participantId, day, o.taskDefinitionId) < rate) {
          completed.push({ id: o.id, reward: o.taskDefinition.reward });
          coins += o.taskDefinition.reward;
        }
      }
    }

    if (completed.length > 0) {
      await prisma.taskOccurrence.updateMany({
        where: { id: { in: completed.map((c) => c.id) } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      const participant = await prisma.goalParticipant.findUnique({
        where: { id: participantId },
        include: { goal: true },
      });
      if (participant) {
        await prisma.rewardTransaction.createMany({
          data: completed.map(({ id, reward }) => ({
            userId: participant.userId,
            amount: reward,
            reason: 'TASK_COMPLETED',
            goalId: participant.goalId,
            taskOccurrenceId: id,
          })),
        });
        await prisma.profile.update({
          where: { userId: participant.userId },
          data: { totalCoins: { increment: coins } },
        });
      }
    }
  }

  // Alex is the most consistent, Kitty is close behind, Maria and Luka trail.
  // Everyone except Kitty has already done some of today, so the Daily
  // leaderboard has something to show and Kitty still has tasks waiting.
  await fillHistory(fitAlex.id, 0.95, true);
  await fillHistory(fitKitty.id, 0.85);
  await fillHistory(fitMaria.id, 0.7, true);
  await fillHistory(readKitty.id, 0.9);
  await fillHistory(chAlex.id, 0.9, true);
  await fillHistory(chKitty.id, 0.72);
  await fillHistory(chMaria.id, 0.62, true);
  await fillHistory(chLuka.id, 0.55, true);
  await fillHistory(chDana.id, 0.45, true);

  // Streaks are derived from the occurrence history, never invented, so the
  // seeded numbers match exactly what the engine computes at runtime.
  for (const { goal, participants } of allGoals) {
    for (const participant of participants) {
      const input = await buildScoreInput(goal, participant, todayIn(goal.timezone));
      const streak = computeStreak(input, todayIn(goal.timezone));
      await prisma.goalParticipant.update({
        where: { id: participant.id },
        data: { currentStreak: streak.current, bestStreak: streak.best },
      });
    }
  }

  // Levels and best streaks follow from what was actually recorded.
  const profiles = await prisma.profile.findMany();
  for (const p of profiles) {
    const best = await prisma.goalParticipant.aggregate({
      where: { userId: p.userId },
      _max: { bestStreak: true },
    });
    await prisma.profile.update({
      where: { id: p.id },
      data: {
        level: Math.floor(p.totalCoins / 500) + 1,
        bestStreak: best._max.bestStreak ?? 0,
      },
    });
  }

  // ---------------------------------------------------------- notifications

  await prisma.notification.createMany({
    data: [
      {
        userId: kitty.id,
        type: 'FRIEND',
        title: 'Alex completed today’s challenge',
        body: '30-Day Reading Challenge',
        data: JSON.stringify({ goalId: reading.id }),
      },
      {
        userId: kitty.id,
        type: 'LEADERBOARD',
        title: 'You moved up to #2',
        body: '30-Day Reading Challenge',
        data: JSON.stringify({ goalId: reading.id }),
      },
      {
        userId: kitty.id,
        type: 'PROGRESS',
        title: 'You’re on a 12-day streak',
        body: 'Get Fit',
        data: JSON.stringify({ goalId: getFit.id }),
      },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    goals: await prisma.goal.count(),
    tasks: await prisma.taskDefinition.count(),
    occurrences: await prisma.taskOccurrence.count(),
    completed: await prisma.taskOccurrence.count({ where: { status: 'COMPLETED' } }),
  };

  console.log('Seeded Goalify');
  console.table(counts);
  console.log(`\nSign in with any of these (password: ${PASSWORD}):`);
  console.log('  kitty@goalify.app   (the main account)');
  console.log('  alex@goalify.app / maria@goalify.app / luka@goalify.app / dana@goalify.app');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
