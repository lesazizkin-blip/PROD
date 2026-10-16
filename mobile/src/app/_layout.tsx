import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProjectProvider } from "../state/ProjectContext";
import { darkTheme, lightTheme } from "../theme";

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? darkTheme : lightTheme;
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <ProjectProvider>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerStyle: { backgroundColor: theme.colors.surface }, headerTintColor: theme.colors.onSurface, contentStyle: { backgroundColor: theme.colors.background } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="tips" options={{ title: "Памятки" }} />
            <Stack.Screen name="new-project" options={{ title: "Новый проект", presentation: "modal" }} />
            <Stack.Screen name="projects/[pid]/boxes/[n]/index" options={{ title: "Коробка" }} />
            <Stack.Screen name="projects/[pid]/boxes/[n]/label" options={{ title: "Этикетка" }} />
          </Stack>
        </ProjectProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
