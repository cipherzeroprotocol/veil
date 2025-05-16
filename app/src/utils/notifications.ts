type NotificationType = 'success' | 'info' | 'warning' | 'error';

interface NotificationOptions {
  type: NotificationType;
  message: string;
  description?: string;
  duration?: number;
  onClose?: () => void;
}

// Notification container element
let container: HTMLElement | null = null;

// Initialize the notification container
function initContainer(): HTMLElement {
  if (container) return container;
  
  // Create a container for notifications
  container = document.createElement('div');
  container.id = 'notification-container';
  container.style.position = 'fixed';
  container.style.top = '20px';
  container.style.right = '20px';
  container.style.zIndex = '9999';
  container.style.width = '300px';
  container.style.maxWidth = '100%';
  
  document.body.appendChild(container);
  
  return container;
}

// Create a notification element
function createNotificationElement(options: NotificationOptions): HTMLElement {
  const {
    type,
    message,
    description,
    duration = 5000,
    onClose
  } = options;
  
  // Create notification element
  const notificationElement = document.createElement('div');
  notificationElement.style.backgroundColor = getBackgroundColor(type);
  notificationElement.style.color = getTextColor(type);
  notificationElement.style.padding = '12px 16px';
  notificationElement.style.borderRadius = '4px';
  notificationElement.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
  notificationElement.style.marginBottom = '16px';
  notificationElement.style.transition = 'all 0.3s ease-in-out';
  notificationElement.style.opacity = '0';
  notificationElement.style.transform = 'translateX(100%)';
  notificationElement.style.position = 'relative';
  
  // Title
  const titleElement = document.createElement('div');
  titleElement.style.fontWeight = 'bold';
  titleElement.style.marginBottom = description ? '4px' : '0';
  titleElement.textContent = message;
  notificationElement.appendChild(titleElement);
  
  // Description (if provided)
  if (description) {
    const descriptionElement = document.createElement('div');
    descriptionElement.style.fontSize = '14px';
    descriptionElement.textContent = description;
    notificationElement.appendChild(descriptionElement);
  }
  
  // Close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.position = 'absolute';
  closeButton.style.top = '8px';
  closeButton.style.right = '8px';
  closeButton.style.background = 'transparent';
  closeButton.style.border = 'none';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '16px';
  closeButton.style.color = getTextColor(type);
  closeButton.style.opacity = '0.7';
  closeButton.style.padding = '0';
  closeButton.style.width = '20px';
  closeButton.style.height = '20px';
  
  closeButton.addEventListener('click', () => {
    removeNotification(notificationElement);
    if (onClose) onClose();
  });
  
  notificationElement.appendChild(closeButton);
  
  // Auto-close after duration
  if (duration > 0) {
    setTimeout(() => {
      removeNotification(notificationElement);
      if (onClose) onClose();
    }, duration);
  }
  
  return notificationElement;
}

// Add a notification to the container
function addNotification(notificationElement: HTMLElement): void {
  const container = initContainer();
  container.appendChild(notificationElement);
  
  // Trigger animation
  setTimeout(() => {
    notificationElement.style.opacity = '1';
    notificationElement.style.transform = 'translateX(0)';
  }, 10);
}

// Remove a notification from the container
function removeNotification(notificationElement: HTMLElement): void {
  notificationElement.style.opacity = '0';
  notificationElement.style.transform = 'translateX(100%)';
  
  // Remove element after animation
  setTimeout(() => {
    if (notificationElement.parentNode) {
      notificationElement.parentNode.removeChild(notificationElement);
    }
    
    // Remove container if empty
    if (container && container.childNodes.length === 0) {
      document.body.removeChild(container);
      container = null;
    }
  }, 300);
}

// Get background color based on notification type
function getBackgroundColor(type: NotificationType): string {
  switch (type) {
    case 'success': return '#f6ffed';
    case 'info': return '#e6f7ff';
    case 'warning': return '#fffbe6';
    case 'error': return '#fff2f0';
    default: return '#ffffff';
  }
}

// Get text color based on notification type
function getTextColor(type: NotificationType): string {
  switch (type) {
    case 'success': return '#52c41a';
    case 'info': return '#1890ff';
    case 'warning': return '#faad14';
    case 'error': return '#ff4d4f';
    default: return '#000000';
  }
}

// Main notify function
export function notify(options: NotificationOptions): void {
  const notificationElement = createNotificationElement(options);
  addNotification(notificationElement);
}

// Convenience methods
notify.success = (message: string, description?: string, duration?: number, onClose?: () => void) => {
  notify({ type: 'success', message, description, duration, onClose });
};

notify.info = (message: string, description?: string, duration?: number, onClose?: () => void) => {
  notify({ type: 'info', message, description, duration, onClose });
};

notify.warning = (message: string, description?: string, duration?: number, onClose?: () => void) => {
  notify({ type: 'warning', message, description, duration, onClose });
};

notify.error = (message: string, description?: string, duration?: number, onClose?: () => void) => {
  notify({ type: 'error', message, description, duration, onClose });
};