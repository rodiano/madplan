import { useEffect, useMemo, useState, type FormEvent } from 'react'
import dishesData from './data/dishes.json'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'
import './App.css'

type Dish = {
  id: number
  navn: string
}

type WeekPlan = Record<number, number>

const initialDishes = dishesData as Dish[]

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
  const baseWeek = useMemo(() => startOfWeek(new Date()), [])
  const [dishes, setDishes] = useState<Dish[]>(initialDishes)
  const [weekOffset, setWeekOffset] = useState(0)
  const [editableDays, setEditableDays] = useState<Record<string, boolean>>({})
  const [isDishModalOpen, setIsDishModalOpen] = useState(false)
  const [newDishNavn, setNewDishNavn] = useState('')
  const [newDishError, setNewDishError] = useState('')
  const [dishesError, setDishesError] = useState('')
  const [isSavingDish, setIsSavingDish] = useState(false)
  const [isLoadingDishes, setIsLoadingDishes] = useState(isSupabaseConfigured)
  const [plansByWeek, setPlansByWeek] = useState<Record<string, WeekPlan>>(() => ({
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
  }

  const toggleDay = (dayIndex: number) => {
    const key = `${currentWeekKey}-${dayIndex}`

    setEditableDays((currentState) => ({
      ...currentState,
      [key]: !currentState[key],
    }))
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

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-header">
          <div>
            <p className="eyebrow">Madplan</p>
                   </div>

          <button
            type="button"
            className="add-dish-button"
            aria-label="Tilføj ny ret"
            onClick={() => setIsDishModalOpen(true)}
          >
            +
          </button>
        </div>

        <div className="hero-meta">
          <span>{dishes.length} retter i databasen</span>
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
            onClick={() => setWeekOffset((value) => value - 1)}
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
            onClick={() => setWeekOffset((value) => value + 1)}
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
            const isEditable = editableDays[editableKey] ?? false

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
                      <label className="select-wrapper">
                        <span className="sr-only">Vælg ret for {dayName}</span>
                        <select
                          value={selectedDishId}
                          onChange={(event) =>
                            handleDishChange(index, Number(event.target.value))
                          }
                          disabled={dishes.length === 0}
                        >
                          {dishes.map((dish) => (
                            <option key={dish.id} value={dish.id}>
                              {dish.navn}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="lock-icon-button"
                        aria-label={`Lås ${dayName}`}
                        onClick={() => toggleDay(index)}
                      >
                        🔓
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
                            📖
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        className="lock-icon-button"
                        aria-label={`Lås op for ${dayName}`}
                        onClick={() => toggleDay(index)}
                      >
                        🔒
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
