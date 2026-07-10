import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  HiLockClosed,
  HiLockOpen,
  HiOutlineBookOpen,
  HiPlus,
} from 'react-icons/hi2'
import { MdCasino } from 'react-icons/md'
import dishesData from './data/dishes.json'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'
import './App.css'

type Dish = {
  id: number
  navn: string
}

type WeekPlan = Record<number, number>
type PlansByWeek = Record<string, WeekPlan>

const initialDishes = dishesData as Dish[]
const MAX_FUTURE_WEEK_OFFSET = 1
const AUTH_STORAGE_KEY = 'madplan-authenticated'
const APP_PASSCODE = import.meta.env.VITE_APP_PASSCODE ?? ''

const weekDays = [
  'Mandag',
  'Tirsdag',
  'Onsdag',
  'Torsdag',
  'Fredag',
  'Lørdag',
  'Søndag',
]

function startOfWeek(date: Date) {
  const result = new Date(date)
  const day = result.getDay()
  const diff = day === 0 ? -6 : 1 - day

  result.setDate(result.getDate() + diff)
  result.setHours(0, 0, 0, 0)

  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7)
}

function getWeekDistance(first: Date, second: Date) {
  return Math.round(
    (startOfWeek(first).getTime() - startOfWeek(second).getTime()) /
      (7 * 24 * 60 * 60 * 1000),
  )
}

function getWeekKey(date: Date) {
  return startOfWeek(date).toISOString().slice(0, 10)
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit',
    month: '2-digit',
  }).format(date)
}

function formatMonthRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6)
  const formatter = new Intl.DateTimeFormat('da-DK', {
    day: 'numeric',
    month: 'long',
  })

  return `${formatter.format(weekStart)} - ${formatter.format(weekEnd)}`
}

function getWeekNumber(date: Date) {
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))

  const firstThursday = new Date(target.getFullYear(), 0, 4)
  firstThursday.setDate(
    firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7),
  )

  return (
    1 +
    Math.round(
      (target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    )
  )
}

function createInitialWeekPlan(weekStart: Date, dishList: Dish[]) {
  if (dishList.length === 0) {
    return {}
  }

  const seed = Math.floor(weekStart.getTime() / (24 * 60 * 60 * 1000))

  return weekDays.reduce<WeekPlan>((plan, _day, index) => {
    const dish = dishList[(seed + index) % dishList.length]
    plan[index] = dish.id
    return plan
  }, {})
}

function getDishById(dishList: Dish[], id: number) {
  return dishList.find((dish) => dish.id === id)
}

function shuffleDishes(dishList: Dish[]) {
  const copy = [...dishList]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]]
  }

  return copy
}

function getReservedDishIds(weekStart: Date, plansByWeek: PlansByWeek) {
  const reservedDishIds = new Set<number>()

  Object.entries(plansByWeek).forEach(([weekKey, plan]) => {
    const otherWeekStart = new Date(`${weekKey}T00:00:00`)
    const weekDistance = Math.abs(getWeekDistance(otherWeekStart, weekStart))

    if (weekDistance > 0 && weekDistance < 3) {
      Object.values(plan).forEach((dishId) => reservedDishIds.add(dishId))
    }
  })

  return reservedDishIds
}

function createBalancedWeekPlan(
  weekStart: Date,
  dishList: Dish[],
  plansByWeek: PlansByWeek,
  excludedDishIds: number[] = [],
) {
  if (dishList.length === 0) {
    return {}
  }

  const blockedDishIds = getReservedDishIds(weekStart, plansByWeek)
  excludedDishIds.forEach((dishId) => blockedDishIds.add(dishId))

  const preferredDishes = shuffleDishes(
    dishList.filter((dish) => !blockedDishIds.has(dish.id)),
  )
  const fallbackDishes = shuffleDishes(
    dishList.filter(
      (dish) => !preferredDishes.some((preferredDish) => preferredDish.id === dish.id),
    ),
  )
  const rotationPool =
    preferredDishes.length > 0
      ? [...preferredDishes, ...fallbackDishes]
      : shuffleDishes(dishList)

  return weekDays.reduce<WeekPlan>((plan, _day, index) => {
    plan[index] = rotationPool[index % rotationPool.length].id
    return plan
  }, {})
}

function generateUniqueDishId(dishList: Dish[]) {
  const existingIds = new Set(dishList.map((dish) => dish.id))
  let candidate = 0

  do {
    const randomSuffix = Math.floor(Math.random() * 1000)
    candidate = Number(`${Date.now()}${String(randomSuffix).padStart(3, '0')}`)
  } while (existingIds.has(candidate))

  return candidate
}

function App() {
  const [loginCode, setLoginCode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.sessionStorage.getItem(AUTH_STORAGE_KEY) === 'yes'
  })
  const baseWeek = useMemo(() => startOfWeek(new Date()), [])
  const [dishes, setDishes] = useState<Dish[]>(initialDishes)
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeEditableKey, setActiveEditableKey] = useState<string | null>(null)
  const [dishSearchByDay, setDishSearchByDay] = useState<Record<string, string>>({})
  const [isDishModalOpen, setIsDishModalOpen] = useState(false)
  const [newDishNavn, setNewDishNavn] = useState('')
  const [newDishError, setNewDishError] = useState('')
  const [dishesError, setDishesError] = useState('')
  const [isSavingDish, setIsSavingDish] = useState(false)
  const [isLoadingDishes, setIsLoadingDishes] = useState(isSupabaseConfigured)
  const [plansByWeek, setPlansByWeek] = useState<PlansByWeek>(() => ({
    [getWeekKey(baseWeek)]: createInitialWeekPlan(baseWeek, initialDishes),
  }))

  const currentWeekStart = useMemo(
    () => addWeeks(baseWeek, weekOffset),
    [baseWeek, weekOffset],
  )
  const currentWeekKey = getWeekKey(currentWeekStart)
  const weekPlan =
    plansByWeek[currentWeekKey] ?? createInitialWeekPlan(currentWeekStart, dishes)
  const weekNumber = getWeekNumber(currentWeekStart)
  const canEditWeek = weekOffset >= 0 && weekOffset <= MAX_FUTURE_WEEK_OFFSET
  const hasPasscode = APP_PASSCODE.trim().length > 0

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!hasPasscode) {
      setLoginError('Sæt VITE_APP_PASSCODE i .env først.')
      return
    }

    if (loginCode === APP_PASSCODE) {
      window.sessionStorage.setItem(AUTH_STORAGE_KEY, 'yes')
      setIsAuthenticated(true)
      setLoginError('')
      return
    }

    setLoginError('Forkert kode.')
  }

  useEffect(() => {
    if (dishes.length === 0) {
      return
    }

    setPlansByWeek((currentPlans) => {
      const validDishIds = new Set(dishes.map((dish) => dish.id))
      let didChange = false

      const nextPlans = Object.fromEntries(
        Object.entries(currentPlans).filter(([, plan]) => {
          const isValid = Object.values(plan).every((dishId) => validDishIds.has(dishId))

          if (!isValid) {
            didChange = true
          }

          return isValid
        }),
      ) as PlansByWeek

      if (!nextPlans[currentWeekKey]) {
        nextPlans[currentWeekKey] = createBalancedWeekPlan(
          currentWeekStart,
          dishes,
          nextPlans,
        )
        didChange = true
      }

      return didChange ? nextPlans : currentPlans
    })
  }, [currentWeekKey, currentWeekStart, dishes])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return
    }

    const supabaseClient = supabase

    const loadDishes = async () => {
      setIsLoadingDishes(true)
      setDishesError('')

      const { data, error } = await supabaseClient
        .from('dishes')
        .select('id, navn')
        .order('id', { ascending: true })

      if (error) {
        setDishesError('Kunne ikke hente retter fra databasen.')
        setIsLoadingDishes(false)
        return
      }

      if (data && data.length > 0) {
        setDishes(data)
      }

      setIsLoadingDishes(false)
    }

    void loadDishes()
  }, [])

  const handleDishChange = (dayIndex: number, dishId: number) => {
    setPlansByWeek((currentPlans) => ({
      ...currentPlans,
      [currentWeekKey]: {
        ...(currentPlans[currentWeekKey] ??
          createInitialWeekPlan(currentWeekStart, dishes)),
        [dayIndex]: dishId,
      },
    }))

    const editableKey = `${currentWeekKey}-${dayIndex}`
    const selectedDishName = getDishById(dishes, dishId)?.navn ?? ''

    setDishSearchByDay((currentState) => ({
      ...currentState,
      [editableKey]: selectedDishName,
    }))
  }

  const toggleDay = (dayIndex: number) => {
    if (!canEditWeek) {
      return
    }

    const key = `${currentWeekKey}-${dayIndex}`
    setActiveEditableKey((currentKey) => (currentKey === key ? null : key))
  }

  const handlePreviousWeek = () => {
    setWeekOffset((value) => value - 1)
  }

  const handleNextWeek = () => {
    setWeekOffset((value) => Math.min(value + 1, MAX_FUTURE_WEEK_OFFSET))
  }

  const handleWildcardWeek = () => {
    if (!canEditWeek || dishes.length === 0) {
      return
    }

    const shouldReroll = window.confirm(
      'Vil du finde 7 nye retter til den viste uge?',
    )

    if (!shouldReroll) {
      return
    }

    setPlansByWeek((currentPlans) => ({
      ...currentPlans,
      [currentWeekKey]: createBalancedWeekPlan(
        currentWeekStart,
        dishes,
        currentPlans,
        Object.values(currentPlans[currentWeekKey] ?? {}),
      ),
    }))
    setActiveEditableKey(null)
  }

  const closeDishModal = () => {
    setIsDishModalOpen(false)
    setNewDishNavn('')
    setNewDishError('')
  }

  const handleCreateDish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = newDishNavn.trim()

    if (trimmedName.length === 0) {
      setNewDishError('Navn er påkrævet.')
      return
    }

    setIsSavingDish(true)

    if (isSupabaseConfigured && supabase) {
      const supabaseClient = supabase
      const { data, error } = await supabaseClient
        .from('dishes')
        .insert({ navn: trimmedName })
        .select('id, navn')
        .single()

      if (error || !data) {
        setNewDishError('Kunne ikke gemme retten i databasen.')
        setIsSavingDish(false)
        return
      }

      setDishes((currentDishes) =>
        [...currentDishes, data].sort((left, right) => left.id - right.id),
      )
      setIsSavingDish(false)
      closeDishModal()
      return
    }

    const generatedId = generateUniqueDishId(dishes)

    setDishes((currentDishes) =>
      [...currentDishes, { id: generatedId, navn: trimmedName }].sort(
        (left, right) => left.id - right.id,
      ),
    )

    setIsSavingDish(false)

    closeDishModal()
  }

  if (!isAuthenticated) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>Madplan</h1>
          <p>Indtast kode for at åbne siden.</p>

          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              Kode
              <input
                type="password"
                value={loginCode}
                onChange={(event) => {
                  setLoginCode(event.target.value)
                  if (loginError) {
                    setLoginError('')
                  }
                }}
                autoComplete="off"
                required
              />
            </label>

            {loginError ? <p className="auth-error">{loginError}</p> : null}

            <button type="submit" className="auth-submit">
              Log ind
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-header">
          <div>
            <p className="eyebrow">Madplan</p>
          </div>

          <div className="hero-actions">
            <button
              type="button"
              className="icon-action-button"
              aria-label="Tilføj ny ret"
              onClick={() => setIsDishModalOpen(true)}
            >
              <HiPlus aria-hidden="true" />
            </button>

            <button
              type="button"
              className="icon-action-button"
              aria-label="Wildcard uge"
              disabled={!canEditWeek || dishes.length === 0}
              onClick={handleWildcardWeek}
            >
              <MdCasino aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="hero-meta">
          <span>{dishes.length} retter i databasen</span>
          <span>{canEditWeek ? 'Redigerbar uge' : 'Historisk uge'}</span>
          {isLoadingDishes ? <span>Henter data...</span> : null}
          {dishesError ? <span>{dishesError}</span> : null}
        </div>
      </section>

      <section className="planner-panel">
        <header className="planner-toolbar">
          <button
            type="button"
            className="week-nav-button"
            aria-label="Forrige uge"
            onClick={handlePreviousWeek}
          >
            ←
          </button>

          <div className="planner-heading">
            <h2>Uge {weekNumber}</h2>
            <p>{formatMonthRange(currentWeekStart)}</p>
          </div>

          <button
            type="button"
            className="week-nav-button"
            aria-label="Næste uge"
            disabled={weekOffset >= MAX_FUTURE_WEEK_OFFSET}
            onClick={handleNextWeek}
          >
            →
          </button>
        </header>

        <div className="week-grid" role="list" aria-label="Madplan for hele ugen">
          {weekDays.map((dayName, index) => {
            const dayDate = addDays(currentWeekStart, index)
            const selectedDishId = weekPlan[index]
            const selectedDish = getDishById(dishes, selectedDishId)
            const editableKey = `${currentWeekKey}-${index}`
            const isEditable = canEditWeek && activeEditableKey === editableKey
            const searchTerm = (dishSearchByDay[editableKey] ?? '').trim().toLowerCase()
            const matchingDishes =
              searchTerm.length > 0
                ? dishes.filter((dish) => dish.navn.toLowerCase().includes(searchTerm))
                : dishes
            const visibleDishes = [...matchingDishes].sort((left, right) =>
              left.navn.localeCompare(right.navn, 'da-DK'),
            )

            return (
              <article className="day-card" key={`${currentWeekKey}-${dayName}`} role="listitem">
                <div className="day-header">
                  <div>
                    <p className="day-name">
                      {dayName} <span className="day-date">{formatDay(dayDate)}</span>
                    </p>
                  </div>
                </div>

                <div className="dish-field">
                  {isEditable ? (
                    <div className="dish-value editable">
                      <label className="select-wrapper typeahead-wrapper">
                        <span className="sr-only">Vælg ret for {dayName}</span>
                        <input
                          type="text"
                          className="dish-search-input"
                          placeholder="Søg ret"
                          value={dishSearchByDay[editableKey] ?? ''}
                          onChange={(event) =>
                            setDishSearchByDay((currentState) => ({
                              ...currentState,
                              [editableKey]: event.target.value,
                            }))
                          }
                          disabled={dishes.length === 0}
                        />

                        {dishes.length > 0 && (
                          <div className="typeahead-list" role="listbox">
                            {visibleDishes.map((dish) => (
                              <button
                                type="button"
                                key={dish.id}
                                className="typeahead-item"
                                onClick={() => handleDishChange(index, dish.id)}
                              >
                                {dish.navn}
                              </button>
                            ))}

                            {visibleDishes.length === 0 && (
                              <p className="typeahead-empty">Ingen retter fundet</p>
                            )}
                          </div>
                        )}
                      </label>
                      <button
                        type="button"
                        className="lock-icon-button"
                        aria-label={`Lås ${dayName}`}
                        onClick={() => toggleDay(index)}
                      >
                        <HiLockOpen aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="dish-value locked">
                      <div className="dish-info">
                        <span>{selectedDish?.navn}</span>
                        {selectedDish && (
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(
                              `${selectedDish.navn} opskrift`,
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="recipe-link"
                            aria-label={`Søg opskrift for ${selectedDish.navn}`}
                          >
                            <HiOutlineBookOpen aria-hidden="true" />
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        className="lock-icon-button"
                        aria-label={
                          canEditWeek
                            ? `Lås op for ${dayName}`
                            : `${dayName} kan ikke redigeres`
                        }
                        disabled={!canEditWeek}
                        onClick={() => toggleDay(index)}
                      >
                        <HiLockClosed aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {isDishModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDishModal}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-dish-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="new-dish-title">Tilføj ny ret</h3>

            <form className="modal-form" onSubmit={handleCreateDish}>
              <label>
                Navn
                <input
                  type="text"
                  value={newDishNavn}
                  onChange={(event) => setNewDishNavn(event.target.value)}
                  required
                />
              </label>

              {newDishError ? <p className="modal-error">{newDishError}</p> : null}

              <div className="modal-actions">
                <button type="button" className="secondary" onClick={closeDishModal}>
                  Annuller
                </button>
                <button type="submit" disabled={isSavingDish}>
                  {isSavingDish ? 'Gemmer...' : 'Gem ret'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
