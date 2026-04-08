export function resolveMeetingLink(
  meetingLink?: string | null,
  classroomVirtualLink?: string | null
): string | null {
  const normalizedMeetingLink = normalizeMeetingLink(meetingLink)
  if (normalizedMeetingLink) {
    return normalizedMeetingLink
  }

  return normalizeMeetingLink(classroomVirtualLink)
}

export function normalizeMeetingLink(link?: string | null): string | null {
  if (!link) {
    return null
  }

  const trimmed = link.trim()
  return trimmed.length > 0 ? trimmed : null
}
