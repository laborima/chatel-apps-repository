"use client";

import { useState, useEffect } from "react";
import { t } from "../lib/i18n";

/**
 * NotificationCenter Component
 * Manages push notifications and upcoming activity alerts
 */
export default function NotificationCenter({ activities, className = "" }) {
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState("default");
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState("");

    useEffect(() => {
        if ("Notification" in window) {
            setNotificationPermission(Notification.permission);
            const savedEnabled = localStorage.getItem('notificationsEnabled') === 'true';
            setNotificationsEnabled(Notification.permission === "granted" && savedEnabled);
        }
    }, []);

    useEffect(() => {
        if (notificationsEnabled && activities?.length > 0) {
            // Vérifier si on a déjà notifié aujourd'hui
            const lastNotification = localStorage.getItem('lastNotificationDate');
            const today = new Date().toDateString();
            
            if (lastNotification !== today) {
                const bestActivity = activities.find(a => a.evaluation?.score >= 80);
                if (bestActivity) {
                    new Notification(t("app.title"), {
                        body: `Conditions excellentes pour ${t(`activities.${bestActivity.name}`)} ! (Score: ${bestActivity.evaluation.score})`,
                        icon: "/chatel-apps-repository/icons/android/android-launchericon-192-192.png"
                    });
                    localStorage.setItem('lastNotificationDate', today);
                }
            }
        }
    }, [notificationsEnabled, activities]);

    const requestNotificationPermission = async () => {
        if (!("Notification" in window)) {
            showNotificationToast(t("notifications.toast.error"));
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            
            if (permission === "granted") {
                setNotificationsEnabled(true);
                localStorage.setItem('notificationsEnabled', 'true');
                showNotificationToast(t("notifications.toast.enabled"));
                
                new Notification(t("app.title"), {
                    body: "Vous recevrez des alertes pour les conditions idéales !",
                    icon: "/chatel-apps-repository/icons/android/android-launchericon-192-192.png"
                });
            } else {
                showNotificationToast(t("notifications.toast.disabled"));
                setNotificationsEnabled(false);
                localStorage.setItem('notificationsEnabled', 'false');
            }
        } catch (error) {
            console.error("Error requesting notification permission:", error);
            showNotificationToast(t("notifications.toast.error"));
        }
    };

    const toggleNotifications = () => {
        if (notificationsEnabled) {
            setNotificationsEnabled(false);
            localStorage.setItem('notificationsEnabled', 'false');
            showNotificationToast(t("notifications.toast.disabled"));
        } else {
            requestNotificationPermission();
        }
    };

    const sendActivityNotification = (activity) => {
        if (Notification.permission === "granted") {
            new Notification(t("app.title"), {
                body: `Rappel activé pour ${t(`activities.${activity.name}`)}. Score actuel : ${activity.evaluation.score}/100`,
                icon: "/chatel-apps-repository/icons/android/android-launchericon-192-192.png",
                tag: `activity-${activity.name}`
            });
            showNotificationToast(`Rappel activé pour ${t(`activities.${activity.name}`)}`);
        } else {
            requestNotificationPermission();
        }
    };

    const showNotificationToast = (message) => {
        setToastMessage(message);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
    };

    const getUpcomingActivities = () => {
        if (!activities || activities.length === 0) {
            return [];
        }
        return activities.filter(activity => activity.evaluation?.score >= 70);
    };

    const upcomingActivities = getUpcomingActivities();

    return (
        <div className={`bg-white dark:bg-zinc-900 rounded-lg shadow-md ${className}`}>
            <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                        {t("notifications.title")}
                    </h3>
                    
                    <button
                        onClick={toggleNotifications}
                        className={`relative inline-flex items-center h-8 rounded-full w-14 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            notificationsEnabled 
                                ? "bg-blue-600" 
                                : "bg-zinc-300 dark:bg-zinc-700"
                        }`}
                        aria-label="Toggle notifications"
                    >
                        <span
                            className={`inline-block w-6 h-6 transform transition-transform bg-white rounded-full ${
                                notificationsEnabled ? "translate-x-7" : "translate-x-1"
                            }`}
                        />
                    </button>
                </div>

                {notificationPermission === "denied" && (
                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm text-red-800 dark:text-red-200">
                            ⚠️ Les notifications sont bloquées. Veuillez les activer dans les paramètres de votre navigateur.
                        </p>
                    </div>
                )}

                <div className="mb-6">
                    <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                        {t("notifications.upcoming")}
                    </h4>
                    
                    {upcomingActivities.length > 0 ? (
                        <div className="space-y-3">
                            {upcomingActivities.map((activity, idx) => (
                                <div 
                                    key={idx}
                                    className="p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg border border-green-200 dark:border-green-800"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-zinc-900 dark:text-zinc-50 capitalize">
                                                {t(`activities.${activity.name}`)}
                                            </p>
                                            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                                                Score: {activity.evaluation.score}/100
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => sendActivityNotification(activity)}
                                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                                        >
                                            {t("actions.notify")}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Aucune condition favorable détectée pour le moment.
                        </p>
                    )}
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                    <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                        {t("notifications.settings")}
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Recevez des notifications lorsque les conditions sont idéales pour vos activités favorites.
                    </p>
                </div>
            </div>

            {showToast && (
                <div className="fixed bottom-4 right-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 py-3 rounded-lg shadow-lg animate-fade-in z-50">
                    {toastMessage}
                </div>
            )}
        </div>
    );
}
